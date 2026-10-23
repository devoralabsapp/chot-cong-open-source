import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { assertEmulators } from "../../scripts/emulator-guard";
assertEmulators();
describe("Rules deny mọi client, kể cả chủ tài khoản", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-chotcong",
      firestore: {
        host,
        port: Number(port),
        rules: readFileSync("firebase/firestore.rules", "utf8"),
      },
    });
  });
  afterAll(async () => env?.cleanup());
  for (const uid of [null, "rules-owner", "other-user"])
    it(`chặn read/list/create/update/delete: ${uid ?? "anonymous"}`, async () => {
      const db = uid
        ? env.authenticatedContext(uid).firestore()
        : env.unauthenticatedContext().firestore();
      for (const path of [
        "apps/chotcong/users/rules-owner",
        "apps/chotcong/users/rules-owner/students/student1",
        "apps/chotcong/users/rules-owner/sessions/session1",
        "apps/chotcong/users/rules-owner/statements/statement1",
        "apps/chotcong/users/rules-owner/payments/payment1",
        "apps/chotcong/shareTokens/tokenhash",
        "apps/chotcong/shareRateLimits/bucket1",
        "apps/chotcong/accountDeletions/job1",
        "apps/chotcong/operations/maintenance",
        "apps/chotcong/users/rules-owner/preferences/onboarding",
        "apps/chotcong/users/rules-owner/preferences/appearance",
        "apps/chotcong/users/rules-owner/classes/class1",
        "apps/chotcong/users/rules-owner/lessons/lesson1",
        "apps/chotcong/users/rules-owner/dataExports/export1",
      ]) {
        const ref = doc(db, path);
        await assertFails(getDoc(ref));
        await assertFails(setDoc(ref, { x: 1 }));
        await assertFails(updateDoc(ref, { x: 2 }));
        await assertFails(deleteDoc(ref));
      }
      await assertFails(
        getDocs(collection(db, "apps/chotcong/users/rules-owner/students")),
      );
    });
});
