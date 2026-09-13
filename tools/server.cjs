const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {scan, build, root} = require('./media.cjs');
build();
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.mp4':'video/mp4','.m4v':'video/mp4','.webm':'video/webm','.ogv':'video/ogg','.ogg':'video/ogg'};
const server = http.createServer((req,res)=>{
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400);res.end();return;}
  if (pathname === '/media-manifest.json' || pathname === '/games-data.js') {
    try {
      const data = JSON.stringify(scan());
      res.writeHead(200,{'Content-Type': pathname.endsWith('.js')?'text/javascript':'application/json','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?'':pathname.endsWith('.js')?'var GAMES = '+data+';':data);
    } catch {res.writeHead(500);res.end('Could not scan game folders');}
    return;
  }
  const file = path.resolve(root, '.'+(pathname==='/'?'/games.html':pathname));
  if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  let stat;
  try {stat=fs.statSync(file);if(!stat.isFile() || !fs.realpathSync(file).startsWith(root+path.sep))throw new Error();}catch{res.writeHead(404);res.end();return;}
  const headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store'};
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range){
    const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!range || (!range[1]&&!range[2])){res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;}
    if(range[1]){start=Number(range[1]);if(range[2])end=Math.min(Number(range[2]),end);}
    else start=Math.max(0,stat.size-Number(range[2]));
    if(start>end || start>=stat.size){res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;}
    status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;
  }
  headers['Content-Length']=stat.size?end-start+1:0;res.writeHead(status,headers);
  if(req.method==='HEAD'||!stat.size){res.end();return;}
  fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(8096,'127.0.0.1',()=>console.log('Open http://127.0.0.1:8096/games.html — game folders are scanned whenever a panel opens. Ctrl+C stops the server.'));
