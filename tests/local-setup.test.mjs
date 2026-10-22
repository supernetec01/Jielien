import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeLocal } from "../scripts/local.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "jielien-local-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test("local initialization generates a unique stable database password and preserves native configuration and data", async (t) => {
  const directory = await fixture(t);
  const native =
    "DATABASE_URL=postgresql://existing.example.test/shop\nPORT=3000\n";
  await writeFile(join(directory, ".env"), native);
  const first = await initializeLocal({ directory, env: {} });
  assert.equal(first.created, true);
  const local = await readFile(first.path, "utf8");
  const password = local.match(/^POSTGRES_PASSWORD=([a-f0-9]{64})$/m)[1];
  assert.ok(local.includes(`postgresql://jielien:${password}@db:5432/jielien`));
  assert.equal(await readFile(join(directory, ".env"), "utf8"), native);
  await writeFile(join(directory, "data", "keep.sqlite"), "existing data");
  assert.equal((await initializeLocal({ directory, env: {} })).created, false);
  assert.equal(await readFile(first.path, "utf8"), local);
  assert.equal(
    await readFile(join(directory, "data", "keep.sqlite"), "utf8"),
    "existing data",
  );
  if (process.platform !== "win32")
    assert.equal((await stat(first.path)).mode & 0o777, 0o600);
  const other = await fixture(t);
  const second = await initializeLocal({ directory: other, env: {} });
  assert.notEqual(
    (await readFile(second.path, "utf8")).match(/^POSTGRES_PASSWORD=(.+)$/m)[1],
    password,
  );
});
test("complete receiving instructions copy from native configuration without copying unrelated secrets", async (t) => {
  const directory = await fixture(t);
  await writeFile(
    join(directory, ".env"),
    "BANK_BIN=970407\nBANK_NAME='Test Bank'\nBANK_ACCOUNT_NUMBER=0000000000\nBANK_ACCOUNT_NAME='TEST $RECEIVER'\nUNRELATED_SECRET=private-value\n",
  );
  const result = await initializeLocal({ directory, env: {} });
  assert.equal(result.bankEnabled, true);
  const local = await readFile(result.path, "utf8");
  assert.ok(local.includes("BANK_ACCOUNT_NAME='TEST $RECEIVER'"));
  assert.ok(!local.includes("UNRELATED_SECRET"));
  assert.ok(!local.includes("private-value"));
});
test("partial bank configuration stays disabled and existing local receiving settings are never overwritten", async (t) => {
  const directory = await fixture(t);
  const first = await initializeLocal({
    directory,
    env: { BANK_BIN: "970407" },
  });
  assert.equal(first.bankEnabled, false);
  const source = await readFile(first.path, "utf8");
  assert.ok(source.includes("BANK_BIN=''"));
  await initializeLocal({
    directory,
    env: {
      BANK_BIN: "970407",
      BANK_NAME: "Other Bank",
      BANK_ACCOUNT_NUMBER: "1111111111",
      BANK_ACCOUNT_NAME: "OTHER RECEIVER",
    },
  });
  assert.equal(await readFile(first.path, "utf8"), source);
});
test("invalid existing database configuration is rejected without replacing its password or file", async (t) => {
  const directory = await fixture(t);
  const path = join(directory, ".env.local");
  const invalid =
    "POSTGRES_PASSWORD=existing-value\nLOCAL_DATABASE_URL=postgresql://old.example.test/live\n";
  await writeFile(path, invalid);
  await assert.rejects(
    initializeLocal({ directory, env: {} }),
    /File được giữ nguyên/,
  );
  assert.equal(await readFile(path, "utf8"), invalid);
});
test("concurrent initialization preserves the one created configuration", async (t) => {
  const directory = await fixture(t);
  const results = await Promise.all([
    initializeLocal({ directory, env: {} }),
    initializeLocal({ directory, env: {} }),
  ]);
  assert.equal(results.filter((result) => result.created).length, 1);
  const before = await readFile(results[0].path, "utf8");
  await initializeLocal({ directory, env: {} });
  assert.equal(await readFile(results[0].path, "utf8"), before);
});
