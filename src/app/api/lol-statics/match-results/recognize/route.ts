import {NextRequest, NextResponse} from "next/server";
import {hasApiSession, hasSameOrigin} from "@/lib/auth-server";
import {createReviewReceipt} from "@/lib/lol/match-recognition-receipt";
import {listPlayerAccounts, listPlayers} from "@/lib/lol/repository";
import {recognizeScoreboard} from "@/lib/lol/scoreboard-recognition.server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: NextRequest) {
  if (!await hasApiSession(request)) return responseError("인증이 필요합니다.", 401);
  if (!hasSameOrigin(request)) return responseError("허용되지 않은 요청 출처입니다.", 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    return responseError("점수판 이미지 업로드 형식이 올바르지 않습니다.", 415);
  }
  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) return responseError("점수판 이미지를 선택해 주세요.", 400);
    if (image.size > MAX_IMAGE_BYTES) return responseError("점수판 이미지는 4MB 이하여야 합니다.", 413);
    if (!ALLOWED_TYPES.has(image.type)) return responseError("PNG, JPEG, WebP 이미지만 판독할 수 있습니다.", 415);
    const [players, accounts] = await Promise.all([listPlayers(), listPlayerAccounts()]);
    const recognized = await recognizeScoreboard(Buffer.from(await image.arrayBuffer()), players, accounts);
    const reviewReceipt = createReviewReceipt(recognized.draft.ingestionId, recognized.report.reviews.map((review) => review.id));
    console.info(`[lol-scoreboard] recognized in ${recognized.report.elapsedMs}ms; review=${recognized.report.reviews.length}`);
    return NextResponse.json({...recognized, reviewReceipt});
  } catch (error) {
    const message = error instanceof Error ? error.message : "점수판을 판독하지 못했습니다.";
    console.error(`[lol-scoreboard] recognition failed: ${message}`);
    if (/점수판|OCR|경기 날짜|경기 시간|승패|숫자|합계|Unresolved|image|Input buffer/i.test(message)) {
      return responseError(message, 422);
    }
    return responseError("점수판 판독 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}

function responseError(error: string, status: number) {
  return NextResponse.json({error}, {status});
}
