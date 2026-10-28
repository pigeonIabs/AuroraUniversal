// Capture real signed-out pages with Aurora installed. Never use a personal profile.
const { firefox } = require('playwright');
const fs = require('node:fs/promises');
const {resolve} = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);
const root = resolve(__dirname,'../..'), work = resolve(root,'work/universal-launch');
const shots = [
  {name:'chatgpt-space',site:'chatgpt',url:'https://chatgpt.com/',background:'__space__'},
  {name:'claude-dawn',site:'claude',url:'https://claude.ai/',background:'__dawn__',theme:'light'},
  {name:'gemini-northern-lights',site:'gemini',url:'https://gemini.google.com/app',background:'__northern_lights__'},
  {name:'grok-horizon',site:'grok',url:'https://grok.com/',background:'horizon'},
  {name:'qwen-gradient',site:'qwen',url:'https://chat.qwen.ai/',background:'__gpt5_animated__'},
  {name:'aistudio-ember',site:'aistudio',url:'https://aistudio.google.com/',background:'__ember__'},
  {name:'deepseek-ocean',site:'deepseek',url:'https://chat.deepseek.com/',background:'__deep_ocean__'},
  {name:'huggingface-wallpaper',site:'huggingface',url:'https://huggingface.co/',background:''},
  {name:'chatgpt-black',site:'chatgpt',url:'https://chatgpt.com/',background:'__pure_black__'},
];

async function dismissPrompts(page) {
  // Use the site's own consent controls, never remove or replace website UI.
  for(const label of ['Necessary cookies only','Reject All']) {
    const button = page.getByRole('button',{name:label,exact:true});
    if(await button.count() && await button.first().isVisible()) await button.first().click();
  }
  for(const frame of page.frames()) {
    if(!frame.url().startsWith('https://accounts.google.com/gsi/')) continue;
    const close = frame.getByRole('button',{name:/close/i});
    if(await close.count() && await close.first().isVisible()) await close.first().click();
  }
}

async function recordFrames(page,name) {
  // Firefox's recorder can omit composited backdrop layers. Page screenshots
  // include the complete paint. Preserve their actual timing in the edit.
  const folder=resolve(work,'frames',name);
  await fs.mkdir(folder,{recursive:true});
  const frames=[],started=Date.now();
  while(Date.now()-started<5200) {
    const frame=resolve(folder,`${String(frames.length).padStart(4,'0')}.jpg`);
    const at=(Date.now()-started)/1000;
    await page.screenshot({path:frame,type:'jpeg',quality:95});
    frames.push({file:frame,at});
    const delay=frames.length*1000/15-(Date.now()-started);
    if(delay>0)await page.waitForTimeout(delay);
  }
  const lines=[];
  frames.forEach((frame,index)=>{
    lines.push(`file '${frame.file.replaceAll('\\','/')}'`);
    lines.push(`duration ${Math.max(.001,(frames[index+1]?.at??5.2)-frame.at)}`);
  });
  lines.push(`file '${frames.at(-1).file.replaceAll('\\','/')}'`);
  const list=resolve(folder,'frames.txt');await fs.writeFile(list,lines.join('\n'));
  const output=resolve(work,name+'.mp4');
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',list,'-t','5','-vf','fps=30,setsar=1','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',output],{windowsHide:true});
  return output;
}

async function main() {
  await fs.mkdir(resolve(work,'raw'),{recursive:true});
  const profile = resolve(work,'profile');
  const context = await firefox.launchPersistentContext(profile,{
    headless:true,viewport:{width:1920,height:1080},deviceScaleFactor:1,colorScheme:'dark',
    args:['--marionette','--remote-allow-system-access'],firefoxUserPrefs:{'marionette.port':2831},
  });
  const receipt = resolve(work,'addon.json'), settingsPath = resolve(work,'settings.json');
  const selected=shots.filter(shot=>!process.env.CAPTURE_SITES||process.env.CAPTURE_SITES.split(',').includes(shot.site));
  const previous=JSON.parse(await fs.readFile(resolve(work,'launch-captures.json'),'utf8').catch(()=>'[]'));
  const captures=previous.filter(shot=>!selected.some(next=>next.name===shot.name));
  try {
    await context.clearCookies();
    const port=(await fs.readFile(resolve(profile,'MarionetteActivePort'),'utf8')).trim();
    let first=true;
    for(const shot of selected) {
      let background=shot.background;
      if(background==='horizon') {
        const addon=JSON.parse(await fs.readFile(receipt,'utf8'));
        background=new URL('assets/grok-4.webp',addon.url).href;
      }
      const settings={hasSeenWelcomeScreen:true,theme:shot.theme||'dark',appearance:'clear',glassIntensity:80,
        customBgUrl:background,backgroundBlur:'0',hideQuickSettings:true,hideUpgradeButtons:false,
        hideAIWarnings:false,focusMode:false,extensionEnabled:true,disabledSites:[]};
      // This isolated authoring profile always starts from explicit shared settings.
      for(const site of new Set(shots.map(s=>s.site)))settings[`siteAppearance:${site}`]={};
      await fs.writeFile(settingsPath,JSON.stringify(settings));
      await run('python',[resolve(__dirname,'install_addon.py'),'--port',port,'--receipt',receipt,'--settings',settingsPath,...(first?[]:['--settings-only'])],{windowsHide:true,timeout:60000});
      first=false;
      const page=await context.newPage();
      await page.emulateMedia({colorScheme:shot.theme||'dark'});
      try {
        await page.goto(shot.url,{waitUntil:'domcontentloaded',timeout:60000});
        await page.waitForTimeout(6500);
        await dismissPrompts(page);
        await page.waitForTimeout(1000);
        const state=await page.evaluate(()=>({url:location.href,title:document.title,
          aurora:document.documentElement.classList.contains('cgpt-ambient-on'),
          backgroundClass:document.querySelector('#cgpt-ambient-bg .media-layer.active')?.className,
          scenic:document.querySelector('#cgpt-ambient-bg .media-layer.active .scenic-bg')?.className,
          bodyText:document.body.innerText}));
        if(!state.aurora||!state.backgroundClass)throw new Error('Aurora did not mount for '+shot.name);
        const screenshot=resolve(root,'release/media',`${shot.name}.png`);
        await page.screenshot({path:screenshot});
        // Source descriptors are authoring evidence for material ownership.
        const paint=await page.evaluate(()=>[...document.querySelectorAll('div,section,nav,main,button,input,a,[class]')].filter(node=>!node.closest('#cgpt-ambient-bg')).map(node=>{
          const r=node.getBoundingClientRect(),s=getComputedStyle(node);
          return {tag:node.tagName,class:node.className,bg:s.backgroundColor,image:s.backgroundImage,w:Math.round(r.width),h:Math.round(r.height),surface:node.getAttribute('data-aurora-surface'),plane:node.hasAttribute('data-aurora-plane')};
        }).filter(n=>n.w>200&&n.h>30&&(n.bg!=='rgba(0, 0, 0, 0)'||n.image!=='none')));
        await fs.writeFile(resolve(work,`${shot.name}-paint.json`),JSON.stringify(paint,null,2));
        await fs.writeFile(resolve(work,`${shot.name}-page.txt`),state.bodyText);
        delete state.bodyText;
        const output=await recordFrames(page,shot.name);
        await page.close();
        captures.push({...shot,...state,signedOut:true,width:1920,height:1080,screenshot,video:output,capturedAt:new Date().toISOString()});
        await fs.writeFile(resolve(work,'launch-captures.json'),JSON.stringify(captures,null,2));
        console.log('Captured '+shot.name);
      } finally {if(!page.isClosed())await page.close();}
    }
  } finally {await context.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
