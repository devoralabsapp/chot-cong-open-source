import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { admin } from "@/lib/firebase/admin";
import { profileDocumentSchema } from "@/domain/firestore";
import {
  teacherSettingsSchema,
  type OnboardingState,
} from "@/domain/onboarding";
import { AppError } from "./errors";
import { operation, sessionDto, studentDto, userRef } from "./repository";
const preferenceSchema = z
  .object({
    profileConfirmedAt: z.instanceof(Timestamp),
    updatedAt: z.instanceof(Timestamp),
    schemaVersion: z.literal(1),
  })
  .strict();
export async function getOnboarding(uid: string): Promise<OnboardingState> {
  const root = userRef(uid);
  return admin().db.runTransaction(
    async (tx) => {
      const [profileDoc, preference, students, sessions] = await Promise.all([
        tx.get(root),
        tx.get(root.collection("preferences").doc("onboarding")),
        tx.get(
          root.collection("students").where("archivedAt", "==", null).limit(1),
        ),
        tx.get(
          root
            .collection("sessions")
            .where("status", "==", "completed")
            .limit(1),
        ),
      ]);
      if (!profileDoc.exists)
        throw new AppError(404, "Chưa có hồ sơ giáo viên.");
      const profile = profileDocumentSchema.parse(profileDoc.data());
      if (preference.exists) preferenceSchema.parse(preference.data());
      const previousStudent = students.empty
        ? await tx.get(root.collection("students").limit(1))
        : students;
      const student = students.empty ? null : studentDto(students.docs[0]);
      const session = sessions.empty ? null : sessionDto(sessions.docs[0]);
      const profileConfirmed = preference.exists || !previousStudent.empty;
      return {
        profile: {
          displayName: profile.displayName,
          bankDetails: profile.bankDetails,
        },
        profileConfirmed,
        student,
        session,
        completed: profileConfirmed && !previousStudent.empty && !!session,
      };
    },
    { readOnly: true },
  );
}
export async function confirmOnboardingProfile(
  uid: string,
  raw: unknown,
  requestId: string,
) {
  const input = teacherSettingsSchema.parse(raw);
  return operation(
    uid,
    "onboarding-profile",
    requestId,
    input,
    async (tx, root, now) => {
      const ref = root.collection("preferences").doc("onboarding");
      const [profile, existing] = await tx.getAll(root, ref);
      if (!profile.exists) throw new AppError(404, "Chưa có hồ sơ giáo viên.");
      if (existing.exists) preferenceSchema.parse(existing.data());
      tx.update(root, { ...input, updatedAt: now });
      tx.set(ref, {
        profileConfirmedAt: existing.get("profileConfirmedAt") ?? now,
        updatedAt: now,
        schemaVersion: 1,
      });
      return { id: uid };
    },
  );
}
