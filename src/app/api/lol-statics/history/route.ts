import {NextRequest, NextResponse} from "next/server";
import {hasApiSession} from "@/lib/auth-server";
import {listAllSessions, listMatchResultsPage} from "@/lib/lol/repository";

const PAGE_SIZE = 10;

export async function GET(request: NextRequest) {
  if (!await hasApiSession(request)) {
    return NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
  }
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  if (!Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({error: "올바른 기록 위치를 지정해 주세요."}, {status: 400});
  }
  try {
    const [sessions, page] = await Promise.all([offset === 0 ? listAllSessions() : Promise.resolve([]), listMatchResultsPage(offset, PAGE_SIZE)]);
    return NextResponse.json({sessions, results: page.results, nextOffset: page.nextOffset});
  } catch {
    return NextResponse.json({error: "내전 기록을 불러오지 못했습니다."}, {status: 500});
  }
}
