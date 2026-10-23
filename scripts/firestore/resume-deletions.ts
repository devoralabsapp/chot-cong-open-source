import { setTimeout as pause } from "node:timers/promises";
import { assertEmulators } from "../emulator-guard";
import { advanceDeletionAsOperator } from "../../src/lib/server/account-deletion";
// Local recovery rehearsal only. Production account deletion requires a
// separately authorized operator running the server worker with server IAM.
assertEmulators();
const jobId = process.argv[2];
if (!jobId || !/^[a-f0-9]{64}$/.test(jobId))
  throw new Error(
    "Usage: resume-deletions.ts <SHA-256 job ID>; Emulator only.",
  );
try {
  for (let step = 0; step < 300; step++) {
    const status = await advanceDeletionAsOperator(jobId);
    console.log(
      JSON.stringify({
        event: "deletion.recovery",
        phase: status.phase,
        busy: status.busy,
      }),
    );
    if (status.phase === "done") process.exit(0);
    if (status.busy) await pause(1000);
  }
  process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ event: "deletion.recovery.failed" }));
  process.exitCode = 1;
}
