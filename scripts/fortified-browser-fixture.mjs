// Isolated owner-run Chrome contexts for the combined browser proof. No user profile.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Cdp {
  constructor(url) {
    this.socket=new WebSocket(url);this.nextId=1;this.pending=new Map();this.listeners=new Map();
    this.open=new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',()=>reject(new Error('CDP connection failed')),{once:true});});
    this.socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data), pending=this.pending.get(message.id);
      if(pending){this.pending.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(new Error(`${pending.method}: ${message.error.message}`)):pending.resolve(message.result??{});}
      else for(const listener of this.listeners.get(message.method)??[])listener(message.params??{});
    });
    this.socket.addEventListener('close',()=>{for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('CDP closed'));}this.pending.clear();});
  }
  on(method,listener){const listeners=this.listeners.get(method)??new Set();listeners.add(listener);this.listeners.set(method,listeners);}
  async call(method,params={},timeoutMs=15000){await this.open;return new Promise((resolve,reject)=>{const id=this.nextId++;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timeout`));},timeoutMs);this.pending.set(id,{method,resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
  async evaluate(expression){const response=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);return response.result?.value;}
  close(){this.socket.close();}
}
export async function createFortifiedBrowser() {
  const candidates=[process.env.CHROME_PATH,...(process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium']:['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])].filter(Boolean);
  let executable;for(const candidate of candidates){try{await stat(candidate);executable=candidate;break;}catch{}}
  if(!executable)throw new Error('Chrome unavailable; set CHROME_PATH');
  const profile=await mkdtemp(path.join(os.tmpdir(),'rts-fortified-browser-'));
  const child=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let logs='',manager=null;const pages=new Set();
  child.stderr.on('data',chunk=>{logs=(logs+chunk).slice(-8000);});
  async function dispose(){
    for(const page of pages)page.cdp.close();pages.clear();
    if(manager){try{await manager.call('Browser.close',{},3000);}catch{}manager.close();manager=null;}
    if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await Promise.race([exited,sleep(2500)]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}}
    await rm(profile,{recursive:true,force:true});
  }
  let port;try {
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){if(child.exitCode!==null)throw new Error(`Chrome exited: ${logs}`);try{port=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}await sleep(100);}
    if(!port)throw new Error(`Chrome startup timeout: ${logs}`);
    const version=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();manager=new Cdp(version.webSocketDebuggerUrl);await manager.open;
    return {version:await manager.call('Browser.getVersion'),dispose,
      async page(url,{beforeScript=null,headers=null}={}){
        const {browserContextId}=await manager.call('Target.createBrowserContext');
        const {targetId}=await manager.call('Target.createTarget',{url:'about:blank',browserContextId});
        const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();const target=tabs.find(t=>t.id===targetId);if(!target)throw new Error('Created page missing');
        const cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.open;await cdp.call('Runtime.enable');await cdp.call('Page.enable');await cdp.call('Network.enable');
        if(headers)await cdp.call('Network.setExtraHTTPHeaders',{headers});
        await cdp.call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
        const errors=[];cdp.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.exception?.description??event.exceptionDetails?.text));
        if(beforeScript)await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:beforeScript});
        const page={cdp,errors,async wait(expression,description='browser state',timeoutMs=20000){const deadline=Date.now()+timeoutMs;let last;while(Date.now()<deadline){try{last=await cdp.evaluate(expression);if(last)return last;}catch(error){if(!/context.*destroyed|Cannot find context/i.test(error.message))throw error;}await sleep(100);}const view=await cdp.evaluate(`({boot:document.documentElement.dataset.boot,message:document.querySelector('#studio-message')?.textContent,draft:document.querySelector('#studio-draft-status')?.textContent,name:document.querySelector('#studio-name')?.value,recoveryHidden:document.querySelector('#studio-draft-recovery')?.hidden})`).catch(()=>null);throw new Error(`${description} timeout; last=${JSON.stringify(last)}; view=${JSON.stringify(view)}; errors=${errors.join('; ')}`);},async dispose(){pages.delete(page);cdp.close();await manager.call('Target.disposeBrowserContext',{browserContextId});}};
        pages.add(page);await cdp.call('Page.navigate',{url});return page;
      }};
  }catch(error){await dispose();throw error;}
}
