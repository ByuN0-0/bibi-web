import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {ensurePlayerAccounts, findPlayer, listPlayers, savePlayer, updatePrimaryPlayerAccount} from "@/lib/lol/repository";
import {ROLES, type PlayerProfile, type Role} from "@/lib/lol/types";

export async function GET(request: NextRequest) {
  if (!await hasApiSession(request)) return unauthorized();
  return NextResponse.json({players: await listPlayers()});
}

export async function POST(request: NextRequest) {
  if (!await hasApiSession(request)) return unauthorized();
  if (!hasSameOrigin(request)) return forbidden();
  const parsed = parsePlayerInput(await request.json());
  if ("error" in parsed) return NextResponse.json({error: parsed.error}, {status: 400});
  const input = parsed.value;
  const existing = await findPlayer(input.discordUserId);
  const now = Date.now();
  const identityChanged = !existing
    || existing.value.riotGameName !== input.riotGameName
    || existing.value.riotTagLine !== input.riotTagLine;
  const unranked = {tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0};
  const profile: PlayerProfile = {
    schemaVersion: 1,
    discordUserId: input.discordUserId,
    displayName: input.displayName,
    riotGameName: input.riotGameName,
    riotTagLine: input.riotTagLine,
    puuid: identityChanged ? null : existing!.value.puuid,
    summonerId: identityChanged ? null : existing!.value.summonerId,
    primaryRole: input.primaryRole,
    secondaryRole: input.secondaryRole,
    soloRank: identityChanged ? unranked : existing!.value.soloRank,
    flexRank: identityChanged ? unranked : existing!.value.flexRank,
    recentMatches: identityChanged ? [] : existing!.value.recentMatches,
    roleStats: identityChanged ? {} : existing!.value.roleStats,
    syncStatus: identityChanged ? "FAILED" : existing!.value.syncStatus,
    syncRequestedAt: identityChanged ? 0 : existing!.value.syncRequestedAt,
    lastSyncStartedAt: identityChanged ? 0 : existing!.value.lastSyncStartedAt,
    lastSyncedAt: existing?.value.lastSyncedAt ?? 0,
    syncErrorCode: identityChanged ? "SYNC_REQUIRED" : existing!.value.syncErrorCode,
    revision: (existing?.value.revision ?? 0) + 1,
    createdAt: existing?.value.createdAt ?? now, updatedAt: now,
  };
  await savePlayer(profile);
  if (existing) await updatePrimaryPlayerAccount(existing.value, input.riotGameName, input.riotTagLine);
  else await ensurePlayerAccounts(profile);
  return NextResponse.json({player: profile, needsSync: identityChanged}, {status: existing ? 200 : 201});
}

function parsePlayerInput(input: unknown): {value: {
  discordUserId: string; displayName: string; riotGameName: string; riotTagLine: string;
  primaryRole: Role; secondaryRole: Role;
}; error?: never} | {error: string; value?: never} {
  const body = input as Record<string, unknown>;
  const discordUserId = String(body?.discordUserId ?? "").trim();
  const displayName = String(body?.displayName ?? "").trim();
  const riotGameName = String(body?.riotGameName ?? "").trim();
  const riotTagLine = String(body?.riotTagLine ?? "").trim();
  const primaryRole = String(body?.primaryRole ?? "") as Role;
  const secondaryRole = String(body?.secondaryRole ?? "") as Role;
  if (!/^\d{6,20}$/.test(discordUserId)) return {error: "올바른 Discord 사용자 ID를 입력해 주세요."};
  if (!displayName || !riotGameName || !riotTagLine) return {error: "표시 이름과 Riot ID를 모두 입력해 주세요."};
  if (!ROLES.includes(primaryRole) || !ROLES.includes(secondaryRole)) return {error: "올바른 포지션을 선택해 주세요."};
  if (primaryRole === secondaryRole) return {error: "주 포지션과 부 포지션은 달라야 합니다."};
  return {value: {discordUserId, displayName, riotGameName, riotTagLine, primaryRole, secondaryRole}};
}

const unauthorized = () => NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
const forbidden = () => NextResponse.json({error: "허용되지 않은 요청 출처입니다."}, {status: 403});
