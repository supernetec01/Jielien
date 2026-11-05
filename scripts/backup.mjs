import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream, createReadStream } from "node:fs";
import {
  mkdir,
  open,
  rename,
  rm,
  stat,
  readdir,
  lstat,
  copyFile,
  writeFile,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function saveDump(command, args, destination) {
  const temporary = destination + "." + randomUUID() + ".partial";
  let child;
  try {
    child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    // pg_dump errors may contain connection details; do not echo them.
    child.stderr.resume();
    const exited = new Promise((ok, fail) => {
      child.once("error", fail);
      child.once("close", (code) =>
        code === 0
          ? ok()
          : fail(new Error("pg_dump thất bại; bản backup chưa được công bố.")),
      );
    });
    await Promise.all([
      pipeline(
        child.stdout,
        createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
      ),
      exited,
    ]);
    const handle = await open(temporary, "r");
    try {
      const header = Buffer.alloc(5);
      await handle.read(header, 0, 5, 0);
      if (header.toString() !== "PGDMP" || (await handle.stat()).size < 32)
        throw new Error("Backup không có định dạng PostgreSQL custom hợp lệ.");
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
    return (await stat(destination)).size;
  } catch (error) {
    child?.kill();
    await rm(temporary, { force: true });
    throw error;
  }
}
export async function checksum(path) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}
// The app owns its media files. Read through its existing container identity;
// do not chmod production data to make a host-side backup work.
export const exportMediaScript = String.raw`
import {readdir,readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {createPool} from './lib/database.mjs';
const directory='/app/data/media',seen=new Set(),pool=createPool();
async function emit(record){if(!process.stdout.write(JSON.stringify(record)+'\n'))await once(process.stdout,'drain');}
try{
 let names=[];try{names=await readdir(directory);}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const key of names){if(!/^[a-f0-9-]{36}\.webp$/.test(key))throw Error('Unexpected media entry');const info=await lstat(directory+'/'+key);if(!info.isFile()||info.isSymbolicLink())throw Error('Unsafe media entry');const bytes=await readFile(directory+'/'+key);seen.add(key);await emit({key,data:bytes.toString('base64'),size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const exists=(await pool.query("SELECT to_regclass('media_assets') AS present")).rows[0].present;
 if(exists)for(const row of (await pool.query('SELECT storage_key FROM media_assets')).rows)if(!seen.has(row.storage_key))throw Error('Referenced media file missing');
 await emit({complete:true});
}finally{await pool.end();}
`;
async function saveContainerMedia(command, args, directory) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  child.stderr.resume();
  const completed = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code) => resolve({ code }));
  });
  const media = [];
  let pending = "",
    done = false;
  try {
    for await (const chunk of child.stdout) {
      pending += chunk.toString("utf8");
      if (pending.length > 32 * 1024 * 1024)
        throw Error("Media frame too large");
      let index;
      while ((index = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        if (!line) continue;
        const frame = JSON.parse(line);
        if (done) throw Error("Unexpected media after completion");
        if (frame.complete === true) {
          done = true;
          continue;
        }
        if (
          !/^[a-f0-9-]{36}\.webp$/.test(frame.key) ||
          typeof frame.data !== "string" ||
          frame.data.length > 24 * 1024 * 1024
        )
          throw Error("Invalid media frame");
        const bytes = Buffer.from(frame.data, "base64"),
          sha256 = createHash("sha256").update(bytes).digest("hex");
        if (
          bytes.length !== frame.size ||
          sha256 !== frame.sha256 ||
          bytes.toString("base64") !== frame.data
        )
          throw Error("Media checksum mismatch");
        await writeFile(join(directory, frame.key), bytes, {
          flag: "wx",
          mode: 0o600,
        });
        media.push({ key: frame.key, bytes: bytes.length, sha256 });
      }
    }
    const outcome = await completed;
    if (outcome.error) throw outcome.error;
    if (outcome.code !== 0 || !done || pending.trim())
      throw Error("Media snapshot incomplete");
    return media;
  } catch (error) {
    child.kill();
    await completed;
    throw error;
  }
}
export async function saveBackupBundle({
  command,
  args,
  directory,
  mediaDirectory,
  mediaCommand,
  mediaArgs,
}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `jielien-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const temporary = join(directory, name + ".partial"),
    destination = join(directory, name + ".backup");
  await mkdir(temporary, { mode: 0o700 });
  try {
    const bytes = await saveDump(
      command,
      args,
      join(temporary, "database.dump"),
    );
    await mkdir(join(temporary, "media"), { mode: 0o700 });
    const media = mediaCommand
      ? await saveContainerMedia(
          mediaCommand,
          mediaArgs,
          join(temporary, "media"),
        )
      : [];
    let files = [];
    try {
      if (!mediaCommand) files = await readdir(mediaDirectory);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    for (const file of files) {
      if (!/^[a-f0-9-]{36}\.webp$/.test(file))
        throw Error("Unexpected media entry; refusing unsafe snapshot");
      const source = join(mediaDirectory, file),
        info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink())
        throw Error("Media snapshot requires regular files");
      const target = join(temporary, "media", file);
      await copyFile(source, target);
      media.push({
        key: file,
        bytes: info.size,
        sha256: await checksum(target),
      });
    }
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      database: {
        file: "database.dump",
        bytes,
        sha256: await checksum(join(temporary, "database.dump")),
      },
      media,
    };
    await writeFile(
      join(temporary, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600, flag: "wx" },
    );
    await rename(temporary, destination);
    return { directory: destination, ...manifest };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
async function main() {
  const directory = join(root, "data/backups/postgresql");
  const result = await saveBackupBundle({
    command: "docker",
    args: [
      "compose",
      "--env-file",
      join(root, ".env.local"),
      "-f",
      join(root, "compose.yaml"),
      "exec",
      "-T",
      "db",
      "sh",
      "-c",
      'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc',
    ],
    directory,
    mediaCommand: "docker",
    mediaArgs: [
      "compose",
      "--env-file",
      join(root, ".env.local"),
      "-f",
      join(root, "compose.yaml"),
      "exec",
      "-T",
      "app",
      "node",
      "--input-type=module",
      "-e",
      exportMediaScript,
    ],
  });
  const statusPath = join(root, "data/backups/latest.json"),
    statusTemporary = statusPath + "." + randomUUID() + ".partial";
  await writeFile(
    statusTemporary,
    JSON.stringify({
      createdAt: result.createdAt,
      databaseBytes: result.database.bytes,
      mediaFiles: result.media.length,
    }),
    { mode: 0o600 },
  );
  await rename(statusTemporary, statusPath);
  console.log(
    `Backup bundle: ${result.directory}\nDatabase: database.dump (${result.database.bytes} bytes)\nMedia: ${result.media.length} file(s). SHA-256: manifest.json. Hãy kiểm tra checksum và restore vào DB test trước khi sử dụng.`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(() => {
    console.error(
      "Không tạo được backup. Kiểm tra Docker Desktop, dịch vụ db và quyền ghi thư mục backup.",
    );
    process.exitCode = 1;
  });
