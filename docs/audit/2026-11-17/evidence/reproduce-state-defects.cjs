const projectRoot=require('path').resolve(__dirname,'../../../..');
const ts=require(projectRoot+'/node_modules/typescript');
const fs=require('fs'),path=require('path'),assert=require('assert');
const snapshot=process.argv[2] || '/tmp/sharkbay-audit-2fc9c93';
const root=fs.mkdtempSync('/tmp/sharkbay-states-repro-');
fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
fs.symlinkSync(projectRoot+'/node_modules',path.join(root,'node_modules'));
const modules=path.join(root,'src/main/telegram');fs.mkdirSync(modules,{recursive:true});fs.mkdirSync(path.join(root,'src/shared'),{recursive:true});fs.writeFileSync(path.join(root,'src/shared/agent-status.js'),ts.transpileModule(fs.readFileSync(snapshot+'/src/shared/agent-status.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
for(const name of fs.readdirSync(snapshot+'/src/main/telegram')){
 if(!name.endsWith('.ts'))continue;
 const source=fs.readFileSync(snapshot+'/src/main/telegram/'+name,'utf8');
 fs.writeFileSync(path.join(modules,name.replace(/\.ts$/,'.js')),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
(async()=>{
 const {TelegramService}=await import('file://'+modules+'/service.js');
 let inputs=[],rows=[];
 const deps={now:()=>100,loadConfig:async()=>({enabled:false,botUsername:null,idleTimeoutMs:100000,pairedUsers:[{telegramUserId:1,displayName:'one',pairedAt:'x'},{telegramUserId:2,displayName:'two',pairedAt:'x'}]}),listOpenSessions:async()=>rows,inputTerminal:(id,data)=>inputs.push({id,data}),currentStatus:()=>null};
 const service=new TelegramService(deps);await service.init();
 service.api={sendMessage:async()=>({message_id:1}),answerCallbackQuery:async()=>true,deleteMessage:async()=>true};
 const row=(id)=>({sessionId:id,terminalId:'pty-'+id,projectName:id,agentId:'test',projectPath:'/tmp/project',cwdUri:'local:/tmp/project',model:null,lastEventAt:'2026-11-17',state:null,title:id});
 rows=[row('A')];await service.sendSessions(11,'');
 rows=[row('B')];await service.sendSessions(22,'');
 await service.handleUpdate({update_id:1,message:{message_id:1,from:{id:1},chat:{id:11},text:'1'}});
 assert.equal(service.chats.get(1).ptyId,'pty-B');
 console.log('CONFIRMED: user 1 sees A, user 2 refreshes B, user 1 selects 1 => pty-B');
 await service.handleCallback({id:'old-request-in-A',from:{id:1},message:{chat:{id:11},message_id:123},data:'akey:y'});
 assert.deepEqual(inputs,[{id:'pty-B',data:'y\r'}]);
 console.log('CONFIRMED: old A approval callback => input y to current B, no active approval required');
 let release;const pending=new Promise(r=>release=r);let handled=0;
 const service2=new TelegramService(deps);service2.api={getUpdates:()=>pending};service2.polling=true;service2.handleUpdate=async()=>handled++;
 const loop=service2.pollLoop();await service2.stop();release([{update_id:2}]);await loop;
 assert.equal(handled,1);console.log('CONFIRMED: pending poll returns after stop => still dispatches update');
 const shared=row('shared');service.registerChat(11,1,shared,'pty-shared');service.registerChat(22,2,shared,'pty-shared');service.detach(service.chats.get(1));assert(service.chats.has(2));assert(!service.ptyToChat.has('pty-shared'));console.log('CONFIRMED: first user detaches shared PTY => second user stays registered but loses output routing');
 await service.stop();
 const crashCode=`import {TelegramService} from ${JSON.stringify('file://'+modules+'/service.js')}; const service=new TelegramService({}); service.api={sendChatAction:()=>Promise.reject(new Error('AUDIT_INJECTED_NETWORK_FAILURE'))};service.startTyping({chatId:1,typingTimer:null});setImmediate(()=>console.log('survived'));`;
 const crash=require('child_process').spawnSync(process.execPath,['--input-type=module','-e',crashCode],{encoding:'utf8',timeout:3000});assert.equal(crash.status,1);assert(crash.stderr.includes('AUDIT_INJECTED_NETWORK_FAILURE'));console.log('CONFIRMED: rejected typing side effect exits standalone child Node with status 1');
 console.log('No real network, real PTY, app runtime or user data accessed. Compiled temp dir:',root);
})().catch(e=>{console.error(e);process.exitCode=1});
