import assert from "node:assert/strict";
export async function verifySignupPage(page, app) {
  await page.locator("#verification-form").waitFor();
  const id = await page
    .locator("#verification-form")
    .getAttribute("data-challenge");
  await app.flushRegistrationOutbox();
  const message = app.testRegistrationMessages.get(id);
  assert.ok(
    message,
    "the server must send an OTP via the injected sandbox provider",
  );
  await page.locator("#verification-code").fill(message.code);
  if (message.emailCode)
    await page.locator("#verification-email-code").fill(message.emailCode);
  await page.locator("#verify-submit").click();
}
