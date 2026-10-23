import { admin } from "@/lib/firebase/admin";
import { requestIdSchema } from "@/domain";
import { deletionInputSchema } from "@/domain/data";
import { requireUser } from "@/lib/server/session";
import { checkMutation, errorResponse, jsonBody } from "@/lib/server/http";
import { startDeletion } from "@/lib/server/account-deletion";
import { deletionResponse } from "@/lib/server/deletion-http";
import { AppError } from "@/lib/server/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireUser({ allowDeleting: true });
    await checkMutation(request);
    const input = deletionInputSchema.parse(await jsonBody(request));
    const decoded = await admin()
      .auth.verifyIdToken(input.idToken, true)
      .catch(() => {
        throw new AppError(401, "Hãy xác nhận lại bằng Google.");
      });
    const age = Date.now() / 1000 - decoded.auth_time;
    if (
      decoded.uid !== user.uid ||
      decoded.firebase.sign_in_provider !== "google.com" ||
      age < -30 ||
      age > 300
    )
      throw new AppError(
        403,
        "Hãy chọn đúng tài khoản Google đang mở sổ và xác nhận lại.",
      );
    const proof = await startDeletion(
      user.uid,
      requestIdSchema.parse(request.headers.get("idempotency-key")),
    );
    return deletionResponse(proof);
  } catch (error) {
    return errorResponse(error);
  }
}
