import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasFirebaseServerConfig } from "@/lib/firebase/server-config";

describe("Cấu hình đăng nhập phía server", () => {
  beforeEach(() => {
    for (const name of [
      "FIREBASE_AUTH_EMULATOR_HOST",
      "FIRESTORE_EMULATOR_HOST",
      "FIREBASE_CLIENT_EMAIL",
      "FIREBASE_PRIVATE_KEY",
      "GOOGLE_APPLICATION_CREDENTIALS",
      "FIREBASE_ADMIN_AUTH_MODE",
      "GCP_WORKLOAD_IDENTITY_PROVIDER",
      "GCP_SERVICE_ACCOUNT_EMAIL",
      "VERCEL_ENV",
    ])
      vi.stubEnv(name, "");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("FIREBASE_PROJECT_ID", "test-cloud");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-cloud");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-key");
    vi.stubEnv(
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "test-cloud.firebaseapp.com",
    );
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_USE_EMULATORS", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("web config không đủ để mở đăng nhập server", () => {
    expect(hasFirebaseServerConfig()).toBe(false);
    vi.stubEnv("FIREBASE_CLIENT_EMAIL", "test@example.test");
    expect(hasFirebaseServerConfig()).toBe(false);
    vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-placeholder");
    expect(hasFirebaseServerConfig()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "other-project");
    expect(hasFirebaseServerConfig()).toBe(false);
  });

  it("chỉ cho phép bộ Emulator đầy đủ trên demo project ở local", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("FIREBASE_PROJECT_ID", "demo-chotcong");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-chotcong");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_USE_EMULATORS", "true");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
    expect(hasFirebaseServerConfig()).toBe(false);
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8180");
    expect(hasFirebaseServerConfig()).toBe(true);
    vi.stubEnv("VERCEL", "1");
    expect(hasFirebaseServerConfig()).toBe(false);
  });

  it("OIDC yêu cầu đủ cấu hình, đúng service account và Production", () => {
    vi.stubEnv("FIREBASE_ADMIN_AUTH_MODE", "vercel-oidc");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(hasFirebaseServerConfig()).toBe(false);
    vi.stubEnv(
      "GCP_WORKLOAD_IDENTITY_PROVIDER",
      "projects/123/locations/global/workloadIdentityPools/test/providers/vercel",
    );
    vi.stubEnv(
      "GCP_SERVICE_ACCOUNT_EMAIL",
      "test@test-cloud.iam.gserviceaccount.com",
    );
    expect(hasFirebaseServerConfig()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(hasFirebaseServerConfig()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv(
      "GCP_SERVICE_ACCOUNT_EMAIL",
      "test@other-project.iam.gserviceaccount.com",
    );
    expect(hasFirebaseServerConfig()).toBe(false);
  });
});
