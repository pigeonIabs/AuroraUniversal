// Frame-accurate exports of the extension's own background renderer.
const {firefox}=require('playwright');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs/promises');
const {resolve}=require('node:path');
const root=resolve(__dirname,'../..');
const media=resolve(root,'release/media');
const work=resolve(root,'work/universal-launch');
const fps=30;

async function sequence(browser,{name,theme,duration,rate=1,title=false}){
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:4318/release/studio/scene.html?theme=${theme}${title?'&title=1':''}`);
  await page.evaluate(()=>window.sceneReady());
  const destination=resolve(title?work:media,`${name}.mp4`);
  const encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',destination],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let errors='';encoder.stderr.on('data',chunk=>errors+=chunk);
  const completion=once(encoder,'close');
  for(let frame=0;frame<Math.round(duration*fps);frame++){
    await page.evaluate(({time,rate,title})=>{
      window.setSceneTime(time,rate);
      if(title){
        const entrance=Math.min(1,time/.65),ease=1-Math.pow(1-entrance,4);
        const wordmark=document.querySelector('#wordmark');
        wordmark.style.opacity=String(ease);
        wordmark.style.transform=`scale(${1.055-.055*ease})`;
        wordmark.querySelector('.universal').style.opacity=String(Math.min(1,Math.max(0,(time-.2)/.55)));
      }
    },{time:frame/fps,rate,title});
    const data=await page.screenshot({type:'jpeg',quality:96});
    if(!encoder.stdin.write(data))await once(encoder.stdin,'drain');
    if(frame===Math.round(fps*2))await page.screenshot({path:resolve(title?work:media,`${name}.png`)});
    if(frame%90===0)console.log(`${name} ${Math.round(frame/(duration*fps)*100)}%`);
  }
  encoder.stdin.end();
  const [code]=await completion;
  if(code!==0)throw new Error(errors||'Background render failed');
  await page.close();
  console.log('Rendered '+destination);
}

async function main(){
  await fs.mkdir(work,{recursive:true});await fs.mkdir(media,{recursive:true});
  const browser=await firefox.launch({headless:true});
  try{
    await sequence(browser,{name:'aurora-space-timelapse',theme:'space',duration:24,rate:450});
    await sequence(browser,{name:'aurora-animated-gradient',theme:'gradient',duration:18,rate:1});
    await sequence(browser,{name:'aurora-wordmark',theme:'space',duration:3.6,rate:25,title:true});
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
