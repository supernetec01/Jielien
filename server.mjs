import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
const root=resolve('public');
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end('Không tìm thấy trang');}}).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Jielien storefront listening on port '+(process.env.PORT||3000)));
