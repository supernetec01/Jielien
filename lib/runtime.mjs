import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export function currentRelease(env = process.env) {
  if (/^[a-f0-9]{7,40}$/i.test(env.GIT_COMMIT || "")) return env.GIT_COMMIT;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Container images exclude .git; supply GIT_COMMIT when building/running them.
    return undefined;
  }
}
