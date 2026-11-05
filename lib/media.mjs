import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {reject,text,audit,tx} from './commerce-common.mjs';
export function createMedia(pool,directory=resolve('data/media')){
 async function upload(req,actor){
  const type=(req.headers['content-type']||'').split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(type))reject(415,'invalid_image','Chỉ nhận JPEG, PNG, WebP.');
  const limit=5*1024*1024;if(Number(req.headers['content-length'])>limit)reject(413,'image_too_large','Ảnh tối đa 5 MB.');
  const parts=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)reject(413,'image_too_large','Ảnh tối đa 5 MB.');parts.push(chunk);}const raw=Buffer.concat(parts);
  let alt;try{alt=text(decodeURIComponent(req.headers['x-image-alt']||''),'Alt',250,1);}catch{reject(400,'invalid_alt','Cần mô tả ảnh hợp lệ.');}
  const signature=raw.subarray(0,12);const match=type==='image/png'?signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==='image/jpeg'?signature[0]===255&&signature[1]===216&&signature[2]===255:signature.toString('ascii',0,4)==='RIFF'&&signature.toString('ascii',8,12)==='WEBP';if(!match)reject(415,'invalid_image','Nội dung ảnh không khớp định dạng.');
  let output,info;try{const image=sharp(raw,{limitInputPixels:25_000_000,animated:false}).rotate();const meta=await image.metadata();if(!meta.width||!meta.height||meta.pages>1)throw Error();({data:output,info}=await image.resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true}));}catch{reject(415,'invalid_image','Không giải mã được ảnh hoặc ảnh vượt giới hạn.');}
  const key=randomUUID()+'.webp';await mkdir(directory,{recursive:true});await writeFile(resolve(directory,key),output,{flag:'wx',mode:0o600});
  try{return await tx(pool,async c=>{const asset=(await c.query('INSERT INTO media_assets(storage_key,mime_type,size_bytes,width,height,alt_text,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[key,'image/webp',output.length,info.width,info.height,alt,actor])).rows[0];await audit(c,actor,'media.uploaded','media',asset.id);return {...asset,url:'/media/'+key};});}catch(e){await rm(resolve(directory,key),{force:true});throw e;}
 }
 async function serve(key,user){if(!/^[a-f0-9-]{36}\.webp$/.test(key))reject(404,'not_found','Không tìm thấy ảnh.');const asset=(await pool.query('SELECT id FROM media_assets WHERE storage_key=$1',[key])).rows[0];if(!asset)reject(404,'not_found','Không tìm thấy ảnh.');
 const publicUse=await pool.query(`SELECT 1 FROM product_media m JOIN products p ON p.id=m.product_id WHERE m.url=$1 AND p.status='active' UNION ALL SELECT 1 FROM articles a JOIN article_revisions r ON r.id=a.published_revision_id WHERE a.status IN ('published','draft','in_review','approved','scheduled') AND a.published_at<=now() AND (r.snapshot->>'coverUrl'=$1 OR r.snapshot::text LIKE '%'||$1||'%') LIMIT 1`,['/media/'+key]);
 if(!publicUse.rowCount&&!user?.permissions.includes('media.read'))reject(404,'not_found','Không tìm thấy ảnh.');try{return await readFile(resolve(directory,key));}catch{reject(404,'not_found','Không tìm thấy ảnh.');}}
 return {upload,serve,list:async()=> (await pool.query("SELECT *, '/media/'||storage_key AS url FROM media_assets ORDER BY id DESC LIMIT 100")).rows};
}
