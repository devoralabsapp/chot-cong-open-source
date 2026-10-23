export function assertEmulators() {
  if (
    process.env.FIREBASE_PROJECT_ID !== "demo-chotcong" ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "demo-chotcong" ||
    process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "true"
  )
    throw new Error(
      "Seed/test chỉ chạy với demo-chotcong và web Emulator bật.",
    );
  for (const name of [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
  ]) {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[name] ?? ""))
      throw new Error(`${name} phải trỏ Emulator loopback; từ chối cloud.`);
  }
}
