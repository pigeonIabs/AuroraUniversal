// Local-only media authoring server. Capture profiles are never served.
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,relative,extname}=require('node:path');
const root=resolve(__dirname,'../..');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(root,'.'+path);
  const name=relative(root,file).replaceAll('\\','/');
  const allowed=/^(?:release\/|assets\/|modules\/aurora\/(?:background|preferences)\.js$|(?:shared|theme-background)\.css$)/.test(name)||/^work\/universal-launch\/(?:[a-z0-9-]+\.(?:png|jpg|webp|gif|mp4)|gallery\.html)$/.test(name);
  if(name.startsWith('..')||!allowed){res.writeHead(404).end();return;}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store'});res.end(data);}
  catch{res.writeHead(404).end();}
});
server.listen(4318,'127.0.0.1',()=>console.log('Aurora media preview ready at http://127.0.0.1:4318/release/studio/scene.html'));
