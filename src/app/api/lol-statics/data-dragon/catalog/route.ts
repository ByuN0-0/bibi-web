import {NextRequest, NextResponse} from "next/server";
import {hasApiSession} from "@/lib/auth-server";
import {listDataDragonAssets} from "@/lib/lol/data-dragon";
import {DATA_DRAGON_ASSET_KINDS, type DataDragonAssetKind} from "@/lib/lol/types";
import {MatchResultError} from "@/lib/lol/match-result";

export async function GET(request: NextRequest) {
  if (!await hasApiSession(request)) return NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
  const version = request.nextUrl.searchParams.get("version") ?? "";
  const type = request.nextUrl.searchParams.get("type") as DataDragonAssetKind;
  if (!/^\d+\.\d+\.\d+$/.test(version)) return NextResponse.json({error: "Data Dragon 버전이 올바르지 않습니다."}, {status: 400});
  if (!DATA_DRAGON_ASSET_KINDS.includes(type)) return NextResponse.json({error: "에셋 종류가 올바르지 않습니다."}, {status: 400});
  try {
    return NextResponse.json({assets: await listDataDragonAssets(version, type)});
  } catch (error) {
    if (error instanceof MatchResultError) return NextResponse.json({error: error.message}, {status: error.status});
    return NextResponse.json({error: "Data Dragon 카탈로그를 불러오지 못했습니다."}, {status: 500});
  }
}
