import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveDump } from "../scripts/backup.mjs";
test("backup preserves binary and never publishes failed or invalid output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jielien-backup-"));
  try {
    const file = join(dir, "ok.dump");
    const bytes = Buffer.concat([Buffer.from("PGDMP"), Buffer.alloc(100, 255)]);
    await saveDump(
      process.execPath,
      [
        "-e",
        `process.stdout.write(Buffer.from('${bytes.toString("base64")}','base64'))`,
      ],
      file,
    );
    assert.deepEqual(await readFile(file), bytes);
    for (const code of [
      'process.stdout.write("invalid")',
      'process.stdout.write("PGDMP");process.exit(1)',
    ])
      await assert.rejects(
        saveDump(process.execPath, ["-e", code], join(dir, "bad.dump")),
      );
    assert.deepEqual(await readdir(dir), ["ok.dump"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("backup bundle publishes database and immutable media checksums together", async () => {
  const { saveBackupBundle, checksum } = await import("../scripts/backup.mjs");
  const { mkdir, writeFile, symlink } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "jielien-bundle-"));
  try {
    const media = join(dir, "media");
    await mkdir(media);
    const key = "11111111-1111-1111-1111-111111111111.webp";
    await writeFile(join(media, key), Buffer.from("fake fixture media bytes"));
    const bytes = Buffer.concat([Buffer.from("PGDMP"), Buffer.alloc(100, 255)]);
    const result = await saveBackupBundle({
      command: process.execPath,
      args: [
        "-e",
        `process.stdout.write(Buffer.from('${bytes.toString("base64")}','base64'))`,
      ],
      directory: join(dir, "backups"),
      mediaDirectory: media,
    });
    assert.equal(result.media.length, 1);
    assert.equal(
      await checksum(join(result.directory, "database.dump")),
      result.database.sha256,
    );
    assert.equal(
      await checksum(join(result.directory, "media", key)),
      result.media[0].sha256,
    );
    const badKey = "22222222-2222-2222-2222-222222222222.webp";
    await symlink(join(media, key), join(media, badKey));
    await assert.rejects(
      saveBackupBundle({
        command: process.execPath,
        args: [
          "-e",
          `process.stdout.write(Buffer.from('${bytes.toString("base64")}','base64'))`,
        ],
        directory: join(dir, "backups"),
        mediaDirectory: media,
      }),
    );
    assert.equal((await readdir(join(dir, "backups"))).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("container media stream is checksummed, path constrained and requires a successful completion marker", async () => {
  const { saveBackupBundle } = await import("../scripts/backup.mjs");
  const { createHash } = await import("node:crypto");
  const dir = await mkdtemp(join(tmpdir(), "jielien-container-media-"));
  try {
    const dump = Buffer.concat([Buffer.from("PGDMP"), Buffer.alloc(100)]),
      bytes = Buffer.from("fixture-image");
    const frame = {
      key: "11111111-1111-1111-1111-111111111111.webp",
      data: bytes.toString("base64"),
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const commandArgs = [
      "-e",
      `process.stdout.write(Buffer.from('${dump.toString("base64")}','base64'))`,
    ];
    const run = (frames) =>
      saveBackupBundle({
        command: process.execPath,
        args: commandArgs,
        directory: dir,
        mediaCommand: process.execPath,
        mediaArgs: [
          "-e",
          `process.stdout.write(${JSON.stringify(frames.map((x) => JSON.stringify(x)).join("\n") + "\n")})`,
        ],
      });
    const valid = await run([frame, { complete: true }]);
    assert.equal(valid.media.length, 1);
    assert.deepEqual(
      await readFile(join(valid.directory, "media", frame.key)),
      bytes,
    );
    for (const frames of [
      [frame],
      [{ ...frame, key: "../private.webp" }, { complete: true }],
      [{ ...frame, sha256: "wrong" }, { complete: true }],
    ])
      await assert.rejects(run(frames));
    assert.equal((await readdir(dir)).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('production backups explicitly select the production stack, local backup defaults stay unchanged',async()=>{
 const {backupComposeArgs}=await import('../scripts/backup.mjs');
 assert.ok(backupComposeArgs().some(s=>s.endsWith('/.env.local')));
 assert.ok(backupComposeArgs().some(s=>s.endsWith('/compose.yaml')));
 assert.ok(backupComposeArgs(true).some(s=>s.endsWith('/.env.production')));
 assert.ok(backupComposeArgs(true).some(s=>s.endsWith('/compose.production.yaml')));
});
