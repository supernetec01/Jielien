// Explicit opt-in to the legacy catalog fixture, only in disposable test schemas.
import { fileURLToPath } from "node:url";
import { createApp as createServer } from "../../server.mjs";
export function createApp(options = {}) {
  return createServer({
    catalogPath: fileURLToPath(
      new URL("../../db/fixtures/catalog.json", import.meta.url),
    ),
    ...options,
  });
}
