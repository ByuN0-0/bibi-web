import {NextRequest, NextResponse} from "next/server";
import {hasApiSession} from "@/lib/auth-server";
import {listAllSessions} from "@/lib/lol/repository";

export async function GET(request: NextRequest) {
  if (!await hasApiSession(request)) {
    return NextResponse.json({error: "인증이 필요합니다."}, {status: 401});
  }
  return NextResponse.json({sessions: await listAllSessions()});
}
