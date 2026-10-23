import { afterEach, expect, it, vi } from "vitest";
import { assertEmulators } from "../../scripts/emulator-guard";
afterEach(() => vi.unstubAllEnvs());
function local() {
  vi.stubEnv("FIREBASE_PROJECT_ID", "demo-chotcong");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-chotcong");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_USE_EMULATORS", "true");
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8180");
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
}
it("seed/test chỉ chấp nhận đủ cấu hình demo loopback", () => {
  local();
  expect(() => assertEmulators()).not.toThrow();
});
it("chặn project cloud", () => {
  local();
  vi.stubEnv("FIREBASE_PROJECT_ID", "a-real-project");
  expect(() => assertEmulators()).toThrow();
});
it("chặn thiếu Auth Emulator dù đã có Firestore Emulator", () => {
  local();
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
  expect(() => assertEmulators()).toThrow();
});
it("chặn host ngoài loopback", () => {
  local();
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "firestore.googleapis.com:443");
  expect(() => assertEmulators()).toThrow();
});
