import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,open,rename,rm,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function saveDump(command,args,destination) {
 const temporary=destination+'.'+randomUUID()+'.partial';
 let child;
 try {
  child=spawn(command,args,{cwd:root,stdio:['ignore','pipe','pipe'],shell:false});
  // pg_dump errors may contain connection details; do not echo them.
  child.stderr.resume();
  const exited=new Promise((ok,fail)=>{child.once('error',fail);child.once('close',code=>code===0?ok():fail(new Error('pg_dump thất bại; bản backup chưa được công bố.')));});
  await Promise.all([pipeline(child.stdout,createWriteStream(temporary,{flags:'wx',mode:0o600})),exited]);
  const handle=await open(temporary,'r');
  try {const header=Buffer.alloc(5);await handle.read(header,0,5,0);if(header.toString()!=='PGDMP' || (await handle.stat()).size<32) throw new Error('Backup không có định dạng PostgreSQL custom hợp lệ.');} finally {await handle.close();}
  await rename(temporary,destination);
  return (await stat(destination)).size;
 } catch(error) {child?.kill();await rm(temporary,{force:true});throw error;}
}
async function main(){
 const dir=join(root,'data/backups/postgresql');await mkdir(dir,{recursive:true});
 const target=join(dir,`jielien-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.dump`);
 const bytes=await saveDump('docker',['compose','--env-file',join(root,'.env.local'),'-f',join(root,'compose.yaml'),'exec','-T','db','sh','-c','exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'],target);
 console.log(`Backup: ${target} (${bytes} bytes). Hãy kiểm tra pg_restore --list và restore drill trước khi sử dụng.`);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(()=>{console.error('Không tạo được backup. Kiểm tra Docker Desktop, dịch vụ db và quyền ghi thư mục backup.');process.exitCode=1;});
