import "server-only";
import { json } from "./http";
import { cookieOptions, SESSION_COOKIE } from "./session";
import { DELETION_COOKIE, DELETION_SECONDS } from "./account-deletion";
export function deletionResponse(proof: string) {
  const response = json({ ok: true, redirect: "/account/deletion" });
  response.cookies.set(DELETION_COOKIE, proof, {
    ...cookieOptions(),
    maxAge: DELETION_SECONDS,
  });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
