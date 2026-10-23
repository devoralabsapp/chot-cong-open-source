import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
const demo = "demo-chotcong";
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID !== demo)
  throw new Error("Refusing non-demo project.");
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (
    process.env[key] &&
    !/^(localhost|127\.0\.0\.1):\d+$/.test(process.env[key])
  )
    throw new Error("Refusing non-local emulator host.");
}
const mode = process.argv[2];
if (!["start", "test"].includes(mode))
  throw new Error("Usage: node scripts/emulators.mjs start|test");
const env = {
  ...process.env,
  FIREBASE_PROJECT_ID: demo,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: demo,
  NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "true",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8180",
  APP_ORIGIN: "http://localhost:3000",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-chotcong.firebaseapp.com",
  GCLOUD_PROJECT: demo,
  GOOGLE_CLOUD_PROJECT: demo,
};
for (const key of [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CONFIG",
])
  delete env[key];
const args = [
  "node_modules/firebase-tools/lib/bin/firebase.js",
  mode === "test" ? "emulators:exec" : "emulators:start",
  "--only",
  "auth,firestore",
  "--project",
  demo,
];
if (mode === "test") args.push("node scripts/emulator-checks.mjs");
else {
  if (existsSync("emulator-data/firebase-export-metadata.json"))
    args.push("--import=emulator-data");
  args.push("--export-on-exit=emulator-data");
}
const child = spawn(process.execPath, args, { stdio: "inherit", env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
