import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveDump} from '../scripts/backup.mjs';
test('backup preserves binary and never publishes failed or invalid output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jielien-backup-'));
 try {
 const file=join(dir,'ok.dump');
 const bytes=Buffer.concat([Buffer.from('PGDMP'),Buffer.alloc(100,255)]);
 await saveDump(process.execPath,['-e',`process.stdout.write(Buffer.from('${bytes.toString('base64')}','base64'))`],file);
 assert.deepEqual(await readFile(file),bytes);
 for(const code of ['process.stdout.write("invalid")','process.stdout.write("PGDMP");process.exit(1)'])
 await assert.rejects(saveDump(process.execPath,['-e',code],join(dir,'bad.dump')));
 assert.deepEqual(await readdir(dir),['ok.dump']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
