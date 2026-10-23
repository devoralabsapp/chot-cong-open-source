import { z } from "zod";
import { admin } from "@/lib/firebase/admin";
import {
  checkMutation,
  errorResponse,
  json,
  jsonBody,
} from "@/lib/server/http";
import {
  cookieOptions,
  requireUser,
  SESSION_COOKIE,
} from "@/lib/server/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await checkMutation(request);
    const { allDevices } = z
      .object({ allDevices: z.boolean().default(false) })
      .strict()
      .parse(await jsonBody(request));
    if (allDevices) {
      const user = await requireUser();
      await admin().auth.revokeRefreshTokens(user.uid);
    }
    const response = json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
