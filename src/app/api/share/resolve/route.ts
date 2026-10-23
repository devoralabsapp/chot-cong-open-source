import { z } from "zod";
import { jsonBody } from "@/lib/server/http";
import { appOrigin } from "@/lib/server/session";
import { resolveShare } from "@/lib/server/sharing-repository";
import { allowShareRead } from "@/lib/server/share-rate-limit";
import { shareTokenSchema } from "@/domain/sharing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
const unavailable = () =>
  Response.json({ error: "Bảng kê không khả dụng." }, { status: 404, headers });
export async function POST(request: Request) {
  try {
    if (
      request.headers.get("origin") !== appOrigin() ||
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      return unavailable();
    const parsed = z
      .object({ token: shareTokenSchema })
      .strict()
      .safeParse(await jsonBody(request));
    if (!parsed.success) return unavailable();
    const ip = process.env.VERCEL
      ? (request.headers.get("x-forwarded-for") ?? "unknown")
      : "loopback";
    if (!(await allowShareRead(ip)))
      return Response.json(
        { error: "Tạm thời chưa mở được. Bạn thử lại sau nhé." },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    const statement = await resolveShare(parsed.data.token);
    return statement ? Response.json(statement, { headers }) : unavailable();
  } catch {
    // Never log the request, its body, fragment token, or OAuth error object.
    return unavailable();
  }
}
