const fs=require('node:fs/promises');
const {resolve}=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const root=resolve(__dirname,'../..'),work=resolve(root,'work/universal-launch'),media=resolve(root,'release/media');
const order=['chatgpt-space','claude-dawn','gemini-northern-lights','grok-horizon','qwen-gradient','aistudio-ember','deepseek-ocean','huggingface-wallpaper','chatgpt-black'];
const timeline=[...order.map((name,index)=>({name,duration:[3,2.7,2.4,2.1,1.9,1.7,1.5,1.3,1.1][index]})),
 ...order.slice(0,8).map((name,index)=>({name,duration:[.95,.85,.75,.65,.55,.5,.45,.4][index],offset:2})),
 {name:'aurora-wordmark',duration:3.6}];
async function ffmpeg(args){await run('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{windowsHide:true,maxBuffer:8*1024*1024});}
async function loopGif(input,output,width,fps,duration){
 await ffmpeg(['-i',input,...(duration?['-t',String(duration)]:[]),'-filter_complex',`fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,'-loop','0',output]);
}
async function main(){
 await fs.mkdir(resolve(work,'segments'),{recursive:true});
 let offset=0;
 const files=[];
 for(let index=0;index<timeline.length;index++){
  const shot=timeline[index],destination=resolve(work,'segments',`${String(index).padStart(2,'0')}.mp4`);
  const filter=`fps=30,setsar=1${index===timeline.length-1?',fade=t=out:st=3.2:d=0.4':''}`;
  await ffmpeg(['-ss',String(shot.offset||0),'-i',resolve(work,shot.name+'.mp4'),'-t',String(shot.duration),'-vf',filter,'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',destination]);
  files.push(`file '${destination.replaceAll('\\','/')}'`);
  shot.start=offset;offset+=shot.duration;
 }
 const list=resolve(work,'segments/concat.txt');await fs.writeFile(list,files.join('\n'));
 const output=resolve(media,'aurora-universal-launch.mp4');
 await ffmpeg(['-f','concat','-safe','0','-i',list,'-vf','fps=30,setpts=N/(30*TB)','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',output]);
 console.log('Assembled launch film');
 await loopGif(output,resolve(media,'aurora-universal-launch.gif'),960,10);
 console.log('Rendered README loop');
 await loopGif(resolve(media,'aurora-space-timelapse.mp4'),resolve(media,'aurora-space-timelapse.gif'),720,8,6);
 await loopGif(resolve(media,'aurora-animated-gradient.mp4'),resolve(media,'aurora-animated-gradient.gif'),720,10,6);
 await fs.writeFile(resolve(media,'launch-timeline.json'),JSON.stringify({fps:30,width:1920,height:1080,signedOut:true,shots:timeline},null,2)+'\n');
 console.log('Rendered background loops');
}
main().catch(error=>{console.error(error);process.exitCode=1});
