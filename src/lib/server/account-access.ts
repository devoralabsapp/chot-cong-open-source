import "server-only";
import { createHash } from "node:crypto";
import { admin } from "@/lib/firebase/admin";
import { idSchema } from "@/domain";
import { AppError } from "./errors";
import { assertServiceAvailable } from "./maintenance";
export const accountKey = (uid: string) =>
  createHash("sha256").update(idSchema.parse(uid)).digest("hex");
export const accountControlRef = (uid: string) =>
  admin().db.doc(`apps/chotcong/accountDeletions/${accountKey(uid)}`);
export async function accountBlocked(uid: string) {
  return (await accountControlRef(uid).get()).exists;
}
export async function assertAccountAvailable(uid: string) {
  await assertServiceAvailable();
  if (await accountBlocked(uid))
    throw new AppError(
      423,
      "Tài khoản đang được xóa hoặc đã xóa. Hãy mở trang tiến trình.",
    );
}
export async function assertAccountWritable(
  tx: FirebaseFirestore.Transaction,
  uid: string,
) {
  await assertServiceAvailable(tx);
  if ((await tx.get(accountControlRef(uid))).exists)
    throw new AppError(423, "Tài khoản đang được xóa hoặc đã xóa.");
}
