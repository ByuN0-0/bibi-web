import {NextRequest, NextResponse} from "next/server";
import {listPublishedMatchResultsPage} from "@/lib/lol/repository";
import {toPublicMatchResult} from "@/lib/lol/public-match-result";

const PAGE_SIZE = 10;

export async function GET(request: NextRequest) {
  const rawOffset = request.nextUrl.searchParams.get("offset") ?? "0";
  const offset = Number(rawOffset);
  if (!Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({error: "올바른 기록 위치를 지정해 주세요."}, {status: 400});
  }
  try {
    const page = await listPublishedMatchResultsPage(offset, PAGE_SIZE);
    return NextResponse.json({
      results: page.results.map(toPublicMatchResult),
      nextOffset: page.nextOffset,
    });
  } catch {
    return NextResponse.json({error: "내전 기록을 불러오지 못했습니다."}, {status: 500});
  }
}
