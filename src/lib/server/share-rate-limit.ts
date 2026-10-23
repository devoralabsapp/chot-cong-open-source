import "server-only";
import { createHash } from "node:crypto";
import { admin } from "@/lib/firebase/admin";
// Bounded reusable buckets: no raw IP/token is stored and no TTL service is needed.
export function shareRateBuckets(ip: string, now: number) {
  const slot = createHash("sha256")
    .update(ip.slice(0, 128))
    .digest("hex")
    .slice(0, 3);
  return [
    { id: `ip-${slot}`, window: Math.floor(now / 60000), max: 60 },
    { id: "global-minute", window: Math.floor(now / 60000), max: 240 },
    { id: "global-day", window: Math.floor(now / 86400000), max: 4000 },
  ];
}
export async function allowShareRead(ip: string) {
  const db = admin().db,
    buckets = shareRateBuckets(ip, Date.now());
  return db.runTransaction(async (tx) => {
    const refs = buckets.map((bucket) =>
      db.collection("apps/chotcong/shareRateLimits").doc(bucket.id),
    );
    const docs = await tx.getAll(...refs);
    const counts = buckets.map((bucket, index) =>
      docs[index].get("window") === bucket.window
        ? Number(docs[index].get("count"))
        : 0,
    );
    if (
      counts.some(
        (count, index) =>
          !Number.isSafeInteger(count) ||
          count < 0 ||
          count >= buckets[index].max,
      )
    )
      return false;
    refs.forEach((ref, index) =>
      tx.set(ref, {
        window: buckets[index].window,
        count: counts[index] + 1,
        schemaVersion: 1,
      }),
    );
    return true;
  });
}
