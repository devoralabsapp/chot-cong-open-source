import "server-only";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";
import { vercelIdentityConfig } from "./server-config";
import { createVercelIdentity } from "./vercel-identity";

let federatedIdentity: ReturnType<typeof createVercelIdentity> | undefined;
let federatedFirestore: Firestore | undefined;

export function admin() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId)
    throw new Error("Thiếu FIREBASE_PROJECT_ID. Xem .env.example.");
  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (
    process.env.VERCEL &&
    (authEmulator ||
      firestoreEmulator ||
      process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true")
  )
    throw new Error("Không được dùng Firebase Emulator trên Vercel.");
  if (Boolean(authEmulator) !== Boolean(firestoreEmulator))
    throw new Error(
      "Phải cấu hình cả Auth và Firestore Emulator, hoặc không cấu hình cả hai.",
    );
  if (
    authEmulator &&
    (!projectId.startsWith("demo-") ||
      process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "true")
  ) {
    throw new Error(
      "Emulator chỉ được dùng với demo project và web emulator bật.",
    );
  }
  if (!authEmulator && projectId.startsWith("demo-"))
    throw new Error("Demo project bắt buộc dùng Emulator.");
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId)
    throw new Error("Web và Admin phải dùng cùng Firebase project.");
  const useFederation =
    !authEmulator && process.env.FIREBASE_ADMIN_AUTH_MODE === "vercel-oidc";
  if (useFederation && !federatedIdentity) {
    const config = vercelIdentityConfig();
    if (!config) throw new Error("Thiếu cấu hình Vercel Workload Identity.");
    federatedIdentity = createVercelIdentity(config);
  }
  const app =
    getApps()[0] ??
    initializeApp({
      projectId,
      ...(authEmulator
        ? {}
        : {
            credential: useFederation
              ? federatedIdentity!.credential
              : process.env.FIREBASE_CLIENT_EMAIL &&
                  process.env.FIREBASE_PRIVATE_KEY
                ? cert({
                    projectId,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(
                      /\\n/g,
                      "\n",
                    ),
                  })
                : applicationDefault(),
          }),
    });
  // Admin's getFirestore adapter accepts cert/ADC only. Its exported official
  // Firestore server client accepts GoogleAuth with the same federated identity.
  if (useFederation)
    federatedFirestore ??= new Firestore({
      projectId,
      auth: new GoogleAuth({
        projectId,
        authClient: federatedIdentity!.authClient,
      }),
    });
  return {
    auth: getAuth(app),
    db: useFederation ? federatedFirestore! : getFirestore(app),
  };
}
