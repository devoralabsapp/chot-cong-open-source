import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
it("script tiếp tục xóa từ chối cloud trước mọi thao tác, không dùng nhầm credential production", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/firestore/resume-deletions.ts",
      "a".repeat(64),
    ],
    {
      env: {
        ...process.env,
        FIREBASE_PROJECT_ID: "your-firebase-project",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "your-firebase-project",
        NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "false",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8180",
      },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("demo-chotcong");
});
