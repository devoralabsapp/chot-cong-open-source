import { assertEmulators } from "../emulator-guard";
import { admin } from "../../src/lib/firebase/admin";
import {
  ensureProfile,
  saveSession,
  saveStudent,
} from "../../src/lib/server/repository";
async function seed() {
  assertEmulators();
  const { auth } = admin();
  const teacher = await auth
    .getUserByEmail("mai@example.test")
    .catch(async (error: unknown) => {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "auth/user-not-found"
      ))
        throw error;
      return auth.createUser({
        uid: "seed-teacher",
        displayName: "Cô Mai (dữ liệu giả)",
        email: "mai@example.test",
      });
    });
  const uid = teacher.uid;
  await ensureProfile(uid, "Cô Mai (dữ liệu giả)", "mai@example.test");
  const student = await saveStudent(
    uid,
    { displayName: "Lan (mẫu)", defaultRateVnd: 200000 },
    "11111111-1111-4111-8111-111111111111",
  );
  for (let i = 0; i < 8; i++)
    await saveSession(
      uid,
      {
        studentId: student.id,
        sessionDate: `2026-10-${String(i + 1).padStart(2, "0")}`,
        status: "completed",
        billable: true,
      },
      `22222222-2222-4222-8222-${String(i + 1).padStart(12, "0")}`,
    );
  await saveSession(
    uid,
    {
      studentId: student.id,
      sessionDate: "2026-10-09",
      status: "cancelled",
      billable: false,
    },
    "33333333-3333-4333-8333-333333333333",
  );
  console.log(
    "Seed Emulator hoàn tất: tài khoản mẫu mai@example.test; 8 buổi × 200.000 VND + 1 buổi hủy. Không có dữ liệu thật.",
  );
}
seed().catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "seed/config-error";
  console.error(
    JSON.stringify({
      event: "seed.failed",
      code,
      message:
        "Kiểm tra cấu hình demo và chờ All emulators ready, sau đó chạy lại npm run seed. Không có thao tác nào trỏ production.",
    }),
  );
  process.exitCode = 1;
});
