import "server-only";

export function vercelIdentityConfig() {
  const provider = process.env.GCP_WORKLOAD_IDENTITY_PROVIDER;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (
    process.env.FIREBASE_ADMIN_AUTH_MODE !== "vercel-oidc" ||
    !process.env.VERCEL ||
    process.env.VERCEL_ENV !== "production" ||
    !provider ||
    !/^projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/.test(
      provider,
    ) ||
    !serviceAccountEmail ||
    !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(
      serviceAccountEmail,
    ) ||
    !serviceAccountEmail.endsWith(`@${projectId}.iam.gserviceaccount.com`)
  )
    return null;
  return { provider, serviceAccountEmail };
}

// Configuration presence only; OAuth, IAM and Firestore still need cloud checks.
export function hasFirebaseServerConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (
    !projectId ||
    projectId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    !process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  )
    return false;

  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  const useEmulators =
    process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true";
  if (authEmulator || firestoreEmulator || useEmulators)
    return Boolean(
      !process.env.VERCEL &&
      projectId.startsWith("demo-") &&
      authEmulator &&
      firestoreEmulator &&
      useEmulators,
    );

  if (process.env.FIREBASE_ADMIN_AUTH_MODE === "vercel-oidc")
    return !projectId.startsWith("demo-") && Boolean(vercelIdentityConfig());

  return Boolean(
    !projectId.startsWith("demo-") &&
    ((process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) ||
      (!process.env.VERCEL && process.env.GOOGLE_APPLICATION_CREDENTIALS)),
  );
}
