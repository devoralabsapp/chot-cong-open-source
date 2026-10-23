"use client";
import { getApps, initializeApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  connectAuthEmulator,
  initializeAuth,
  inMemoryPersistence,
} from "firebase/auth";
export function clientAuth() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  if (!projectId || !apiKey || !authDomain)
    throw new Error("Thiếu Firebase web config. Xem .env.example để cấu hình.");
  const app =
    getApps()[0] ??
    initializeApp({
      projectId,
      apiKey,
      authDomain,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  // Select NONE before initialization, so the SDK never starts with its
  // default IndexedDB/localStorage persistence and changes it during a click.
  const auth = initializeAuth(app, {
    persistence: inMemoryPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  if (
    !auth.emulatorConfig &&
    process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true"
  ) {
    // Match the documented web hostname. Mixing localhost with 127.0.0.1
    // leaves Chromium's cross-site Auth relay frame uninitialized.
    connectAuthEmulator(auth, "http://localhost:9099", {
      disableWarnings: true,
    });
  }
  return auth;
}
