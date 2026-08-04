import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {ensurePlayerAccounts, findPlayer, listPlayers, savePlayer, updatePrimaryPlayerAccount} from "@/lib/lol/repository";
import {type PlayerProfile, type RolePreferences} from "@/lib/lol/types";
import {parseRolePreferences, preferredLegacyRoles} from "@/lib/lol/role-preferences";

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
  const [primaryRole, secondaryRole] = preferredLegacyRoles(input.rolePreferences);
  const profile: PlayerProfile = {
    schemaVersion: 3,
    discordUserId: input.discordUserId,
    displayName: input.displayName,
    riotGameName: input.riotGameName,
    riotTagLine: input.riotTagLine,
    puuid: identityChanged ? null : existing!.value.puuid,
    summonerId: identityChanged ? null : existing!.value.summonerId,
    primaryRole,
    secondaryRole,
    rolePreferences: input.rolePreferences,
    soloRank: identityChanged ? unranked : existing!.value.soloRank,
    flexRank: identityChanged ? unranked : existing!.value.flexRank,
    recentMatches: identityChanged ? [] : existing!.value.recentMatches,
    roleStats: identityChanged ? {} : existing!.value.roleStats,
    recentRoleCounts: identityChanged ? {} : existing!.value.recentRoleCounts,
    recentRoleSampleCount: identityChanged ? 0 : existing!.value.recentRoleSampleCount,
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
  rolePreferences: RolePreferences;
}; error?: never} | {error: string; value?: never} {
  const body = input as Record<string, unknown>;
  const discordUserId = String(body?.discordUserId ?? "").trim();
  const displayName = String(body?.displayName ?? "").trim();
  const riotGameName = String(body?.riotGameName ?? "").trim();
  const riotTagLine = String(body?.riotTagLine ?? "").trim();
  const rolePreferences = parseRolePreferences(body?.rolePreferences);
  if (!/^\d{6,20}$/.test(discordUserId)) return {error: "올바른 Discord 사용자 ID를 입력해 주세요."};
  if (!displayName || !riotGameName || !riotTagLine) return {error: "표시 이름과 Riot ID를 모두 입력해 주세요."};
  if (!rolePreferences) return {error: "포지션 선호도는 5% 단위로 입력하고 합계를 100%로 맞춰 주세요."};
  return {value: {discordUserId, displayName, riotGameName, riotTagLine, rolePreferences}};
}

const unauthorized = () => NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
const forbidden = () => NextResponse.json({error: "허용되지 않은 요청 출처입니다."}, {status: 403});
