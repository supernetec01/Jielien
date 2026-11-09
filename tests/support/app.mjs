// Explicit opt-in to the legacy catalog fixture, only in disposable test schemas.
import { fileURLToPath } from "node:url";
import { createApp as createServer } from "../../server.mjs";
export function createApp(options = {}) {
  const messages=new Map();
  return createServer({
    registrationDelivery:async message=>messages.set(message.id,message),
    catalogPath: fileURLToPath(
      new URL("../../db/fixtures/catalog.json", import.meta.url),
    ),
    ...options,
  }).then(app=>{app.testRegistrationMessages=messages;return app;});
}
