// Produce real, signed-out website assets for the launch montage.
const { firefox } = require('playwright');
const fs = require('node:fs/promises');
const { resolve } = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const root = resolve(__dirname, '../..');
const work = resolve(root, 'work/universal-launch');
const sites = [
  ['chatgpt', 'https://chatgpt.com/'],
  ['claude', 'https://claude.ai/'],
  ['gemini', 'https://gemini.google.com/app'],
  ['grok', 'https://grok.com/'],
  ['qwen', 'https://chat.qwen.ai/'],
  ['aistudio', 'https://aistudio.google.com/'],
  ['deepseek', 'https://chat.deepseek.com/'],
  ['huggingface', 'https://huggingface.co/'],
];

async function main() {
  await fs.mkdir(work, {recursive:true});
  const profile = resolve(work, 'profile');
  if (!await fs.access(resolve(profile,'prefs.js')).then(()=>true,()=>false)) {
    const first = await firefox.launchPersistentContext(profile,{headless:true});
    await first.close();
  }
  const context = await firefox.launchPersistentContext(profile, {
    headless:true, viewport:{width:1920,height:1080}, deviceScaleFactor:1,
    args:['--marionette','--remote-allow-system-access'],
    firefoxUserPrefs:{'marionette.port':2831}, colorScheme:'dark',
  });
  try {
    await context.clearCookies();
    const port = (await fs.readFile(resolve(profile,'MarionetteActivePort'),'utf8')).trim();
    console.log('Loading Aurora into the isolated capture browser');
    await fs.writeFile(resolve(work,'settings.json'),JSON.stringify({hasSeenWelcomeScreen:true,theme:'dark',appearance:'clear',glassIntensity:70,customBgUrl:'__space__',backgroundBlur:'0',hideQuickSettings:true,hideUpgradeButtons:true,hideAIWarnings:true,focusMode:false}));
    await run('python',[resolve(__dirname,'install_addon.py'),'--port',port,'--receipt',resolve(work,'addon.json'),'--settings',resolve(work,'settings.json')],{windowsHide:true,timeout:60000});
    const addon = JSON.parse(await fs.readFile(resolve(work,'addon.json'),'utf8'));
    const captures = [];
    for (const [name,url] of sites.filter(([name]) => !process.env.CAPTURE_SITES || process.env.CAPTURE_SITES.split(',').includes(name))) {
      const page = await context.newPage();
      try {
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForTimeout(6000);
        const text = await page.locator('body').innerText({timeout:10000});
        await fs.writeFile(resolve(work,`${name}-page.txt`),text);
        const paint = await page.evaluate(() => {
          const nodes = new Set();
          for (const control of document.querySelectorAll('button, input, form, main, header, [role="button"]')) {
            let node = control;
            for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) nodes.add(node);
          }
          return [...nodes].filter(node => !node.closest('#cgpt-ambient-bg')).map(node => {
            const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
            return {tag:node.tagName,id:node.id,class:node.className,role:node.getAttribute('role'),text:node.matches('button,input,[role="button"]') ? node.textContent.trim().slice(0,70) : '',
              bg:css.backgroundColor,image:css.backgroundImage,fill:node.getAttribute('data-aurora-surface'),plane:node.hasAttribute('data-aurora-plane'),radius:css.borderRadius,w:Math.round(rect.width),h:Math.round(rect.height)};
          }).filter(node => node.w > 0 && node.h > 0);
        });
        await fs.writeFile(resolve(work,`${name}-paint.json`),JSON.stringify(paint,null,2));
        await page.screenshot({path:resolve(work,`${name}-source.png`)});
        const state = await page.evaluate(()=>({url:location.href,title:document.title,aurora:!!document.querySelector('#cgpt-ambient-bg'),width:innerWidth,height:innerHeight}));
        captures.push({name,requested:url,...state});
        console.log(JSON.stringify(captures.at(-1)));
      } catch(error) {
        captures.push({name,requested:url,error:String(error)});
        console.log(name+' capture unavailable '+error.message);
      } finally {await page.close();}
      await fs.writeFile(resolve(work,'signed-out-pages.json'),JSON.stringify(captures,null,2));
    }
  } finally {await context.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
