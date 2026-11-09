// Assertion gate; original probe/evidence remains in docs/ai-fix-kit.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const child = spawn(
  process.execPath,
  [
    "--test",
    "tests/cms-validation.test.mjs",
    "tests/auth-rate-limit.test.mjs",
    "tests/registration.test.mjs",
  ],
  { cwd: root, stdio: "inherit" },
);
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code === 0 ? 0 : 1;
});
