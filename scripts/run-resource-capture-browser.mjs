import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const url = new URL(process.argv[2]);
if (!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('Capture must use a local server.');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(path.join(os.tmpdir(), 'resource-capture-cdp-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
   '--window-size=640,640','--user-data-dir='+profile,'about:blank'], {stdio:'ignore'});
let socket;
try {
  let port;
  for (let i=0;i<100;i++) {
    try {port=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}
    catch {if(chrome.exitCode!==null)throw new Error('Capture Chrome exited before startup');await sleep(100);}
  }
  if(!port)throw new Error('Capture Chrome did not open its debug port');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let nextId=1;
  const pending=new Map(), errors=[];
  socket.addEventListener('message', event=>{
    const message=JSON.parse(event.data);
    if(message.id!==undefined){const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);}
    else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    else if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params.args.map(arg=>arg.value||arg.description).join(' '));
    else if(message.method==='Network.responseReceived'&&message.params.response.status>=400&&new URL(message.params.response.url).pathname!=='/favicon.ico')errors.push(`HTTP ${message.params.response.status}: ${message.params.response.url}`);
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=nextId++,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Capture CDP timed out: '+method));},15000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  await call('Page.navigate',{url:url.href});
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    if(errors.length)throw new Error(errors.join('\n'));
    const result=await call('Runtime.evaluate',{expression:'window.__renderDone === true',returnByValue:true});
    if(result.result?.value){console.log(JSON.stringify({done:true,url:url.href,errors}));break;}
    await sleep(100);
  }
  if(Date.now()>=deadline)throw new Error('Resource capture did not finish within 120 seconds');
} finally {
  socket?.close();chrome.kill('SIGTERM');
  if(chrome.exitCode===null)await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(3000)]);
  if(chrome.exitCode===null){chrome.kill('SIGKILL');await new Promise(resolve=>chrome.once('exit',resolve));}
  await rm(profile,{recursive:true,force:true});
}
