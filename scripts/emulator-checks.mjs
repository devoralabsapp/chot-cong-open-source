import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { createServer } from "node:net";
if (
  process.env.FIREBASE_PROJECT_ID !== "demo-chotcong" ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error("Run through npm run test:emulator.");
// Never connect tests to a web server that this runner does not own.
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(3000, "127.0.0.1", resolve);
});
await new Promise((resolve, reject) =>
  probe.close((error) => (error ? reject(error) : resolve())),
);
const run = (file, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${file} failed: ${code}`)),
    );
  });
// Build with the guarded demo environment so NEXT_PUBLIC Auth config cannot
// inherit a previous cloud build. Exercise production HTTP without dev HMR.
await run("node_modules/next/dist/bin/next", ["build", "--webpack"]);
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ],
  { stdio: "inherit", env: process.env },
);
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null)
      throw new Error(
        "Next server stopped before ready (port 3000 must be free).",
      );
    try {
      const r = await fetch("http://localhost:3000/api/auth/csrf");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(1000);
  }
  if (!ready) throw new Error("Next server did not become ready.");
  await run("node_modules/vitest/vitest.mjs", [
    "run",
    "tests/integration",
    "firebase/tests",
  ]);
  await run("node_modules/@playwright/test/cli.js", ["test"]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
}
