import "server-only";
import {
  appearanceInputSchema,
  appearanceSchema,
  DEFAULT_THEME,
} from "@/domain/appearance";
import { operation, userRef } from "./repository";
import { appearanceDocumentSchema } from "@/domain/firestore";
export async function getAppearance(uid: string) {
  const doc = await userRef(uid)
    .collection("preferences")
    .doc("appearance")
    .get();
  if (!doc.exists) return { theme: DEFAULT_THEME, schemaVersion: 1 as const };
  const data = appearanceDocumentSchema.parse(doc.data());
  return appearanceSchema.parse({
    theme: data.theme,
    schemaVersion: data.schemaVersion,
  });
}
export async function saveAppearance(
  uid: string,
  raw: unknown,
  requestId: string,
) {
  const input = appearanceInputSchema.parse(raw);
  return operation(
    uid,
    "appearance-update",
    requestId,
    input,
    async (tx, root, now) => {
      tx.set(root.collection("preferences").doc("appearance"), {
        ...input,
        schemaVersion: 1,
        updatedAt: now,
      });
      return { id: "appearance" };
    },
  );
}
