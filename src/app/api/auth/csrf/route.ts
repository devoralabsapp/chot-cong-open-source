import { randomBytes } from "node:crypto";
import { json } from "@/lib/server/http";
import { cookieOptions, CSRF_COOKIE } from "@/lib/server/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const token = randomBytes(32).toString("hex");
  const response = json({ token });
  response.cookies.set(CSRF_COOKIE, token, {
    ...cookieOptions(),
    maxAge: 3600,
  });
  return response;
}
