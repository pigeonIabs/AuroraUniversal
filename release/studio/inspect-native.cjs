// Read the current signed-out ChatGPT material tokens for adapter maintenance.
const {firefox}=require('playwright');
const fs=require('node:fs/promises');
const {resolve}=require('node:path');
async function main(){
 const browser=await firefox.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080},colorScheme:'dark'});
  await page.goto('https://chatgpt.com/',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(5000);
  const data=await page.evaluate(()=>{
   const style=getComputedStyle(document.documentElement);
   const tokens=Object.fromEntries([...style].filter(k=>k.startsWith('--')).map(k=>[k,style.getPropertyValue(k)]));
   const nodes=[...document.querySelectorAll('body,body>div,main,aside,header,form,[contenteditable],textarea,[role="textbox"]')].map(node=>({tag:node.tagName,attrs:Object.fromEntries([...node.attributes].map(a=>[a.name,a.value])),parents:[node.parentElement,node.parentElement?.parentElement,node.parentElement?.parentElement?.parentElement].filter(Boolean).map(n=>({tag:n.tagName,attrs:Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))}))}));
   const sheets=[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules].map(r=>r.cssText)}catch{return []}});
   return {tokens,nodes,sheets};
  });
  await fs.writeFile(resolve(__dirname,'../../work/universal-launch/chatgpt-native.json'),JSON.stringify(data,null,2));
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
