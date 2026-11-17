import { mkdtempSync, rmSync } from "node:fs";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createAgentRuntime } from "../src/runtime/agent-runtime.js";
import type { RuntimePaths } from "../src/shared/types.js";
import type { CoreRuntime } from "../src/core/core-runtime.js";
it("keeps exact terminal ids and prompts in reconnect snapshots for a resumed conversation", () => {
 const root=mkdtempSync(path.join(os.tmpdir(),"sharkbay-attribution-"));
 const runtime=createAgentRuntime({userDataPath:root} as RuntimePaths,new EventEmitter() as CoreRuntime,{emit:()=>{},resolveRepoPath:async value=>value});
 try {
  runtime.hookStateManager.injectEvent({agent:"codex",sessionId:"shared-provider",terminalSessionId:"a",event:"turn_end",cwd:root,prompt:"task A",timestamp:new Date().toISOString()});
  runtime.hookStateManager.injectEvent({agent:"codex",sessionId:"shared-provider",terminalSessionId:"b",event:"prompt",cwd:root,prompt:"task B",timestamp:new Date().toISOString()});
  runtime.hookSessionToTerminal.set("shared-provider","b");runtime.promptStore.record("shared-provider","task B");
  const snapshots=runtime.getStatuses();
  expect(snapshots.map(row=>[row.terminalSessionId,row.hookState,row.lastPrompt])).toEqual([["a","done","task A"],["b","working","task B"]]);
 }finally{runtime.hookStateManager.dispose();runtime.promptStore.flushSync();rmSync(root,{recursive:true,force:true});}
});

it("isolates live done and prompt history when two terminals resume one provider id", async () => {
 const { vi } = await import("vitest");
 const { HookBridge } = await import("../src/main/hooks/bridge.js");
 const { AgentSessionWatcher } = await import("../src/main/agent-clis.js");
 const { ReviewControlServer } = await import("../src/main/review-control-server.js");
 const mocks=[vi.spyOn(HookBridge.prototype,"start").mockResolvedValue(undefined),vi.spyOn(AgentSessionWatcher.prototype,"start").mockImplementation(()=>{}),vi.spyOn(ReviewControlServer.prototype,"start").mockResolvedValue(undefined)];
 const root=mkdtempSync(path.join(os.tmpdir(),"sharkbay-live-attribution-"));
 const events: Array<{terminalSessionId?:string;hookState?:string;lastPrompt?:string}> = [];
 const runtime=createAgentRuntime({userDataPath:root} as RuntimePaths,new EventEmitter() as CoreRuntime,{emit:(channel,payload)=>{if(channel==="agents:status")events.push(payload as typeof events[number]);},resolveRepoPath:async value=>value});
 try {
  await runtime.start();
  for(const id of ["a","b"]) runtime.registerCreatedTerminal({id,cwdUri:`local:${root}`,title:id,shell:"/bin/zsh",pid:123,status:"running",createdAt:new Date().toISOString(),agentId:"codex"});
  const send=(terminalSessionId:string,name:string,prompt?:string)=>runtime.hookBridge.emit("event",{source:"codex",terminalSessionId,launchToken:terminalSessionId,payload:{session_id:"shared",hook_event_name:name,cwd:root,prompt}});
  send("a","UserPromptSubmit","task A");send("b","UserPromptSubmit","task B");send("a","Stop");
  expect(events.at(-1)).toMatchObject({terminalSessionId:"a",hookState:"done",lastPrompt:"task A"});
  expect(runtime.getStatuses().find(row=>row.terminalSessionId==="b")).toMatchObject({hookState:"working",lastPrompt:"task B"});
  runtime.recordPrompt({terminalSessionId:"b",text:"new task B"});send("b","PreToolUse");
  expect(runtime.getStatuses().find(row=>row.terminalSessionId==="b")).toMatchObject({hookState:"working",lastPrompt:"new task B"});
  await vi.waitFor(()=>expect(events.at(-1)).toMatchObject({terminalSessionId:"b",hookState:"working",lastPrompt:"new task B"}));
  // A shared Codex daemon retains A's environment even when it runs B's hooks.
  const daemonSend=(name:string,session_id:string,prompt?:string)=>runtime.hookBridge.emit("event",{source:"codex",terminalSessionId:"a",launchToken:"a",payload:{session_id,hook_event_name:name,cwd:root,prompt}});
  daemonSend("SessionStart","provider-b");
  expect(runtime.hookStateManager.getStatusForTerminal("a")).toMatchObject({sessionId:"shared",state:"done",lastPrompt:"task A"});
  runtime.recordPrompt({terminalSessionId:"b",text:"independent task B"});
  daemonSend("UserPromptSubmit","provider-b","independent task B");
  daemonSend("Stop","provider-b");
  expect(events.at(-1)).toMatchObject({terminalSessionId:"b",hookState:"done",lastPrompt:"independent task B"});
  expect(runtime.getStatuses().find(row=>row.terminalSessionId==="a")).toMatchObject({hookState:"done",lastPrompt:"task A"});
  daemonSend("UserPromptSubmit","unowned","unmatched task");
  expect(runtime.hookStateManager.getStatusForTerminal("a")).toMatchObject({sessionId:"shared",state:"done",lastPrompt:"task A"});
  runtime.recordPrompt({terminalSessionId:"a",text:"same input"});
  runtime.recordPrompt({terminalSessionId:"b",text:"same input"});
  daemonSend("UserPromptSubmit","ambiguous","same input");
  expect(runtime.hookStateManager.getStatusForTerminal("a")?.sessionId).toBe("shared");
  expect(runtime.hookStateManager.getStatusForTerminal("b")?.sessionId).toBe("provider-b");
  const count=events.length;
  runtime.hookBridge.emit("event",{source:"codex",terminalSessionId:"a",launchToken:"invalid",payload:{session_id:"shared",hook_event_name:"UserPromptSubmit",cwd:root,prompt:"same input"}});
  expect(events).toHaveLength(count);
 }finally{await runtime.stop();mocks.forEach(mock=>mock.mockRestore());rmSync(root,{recursive:true,force:true});}
});

it("does not let a child session or an unowned Stop replace the terminal's lead session", () => {
 const root=mkdtempSync(path.join(os.tmpdir(),"sharkbay-child-owner-"));
 const runtime=createAgentRuntime({userDataPath:root} as RuntimePaths,new EventEmitter() as CoreRuntime,{emit:()=>{},resolveRepoPath:async value=>value});
 try {
  const base={agent:"codex",terminalSessionId:"a",cwd:root,timestamp:new Date().toISOString()};
  runtime.hookStateManager.injectEvent({...base,sessionId:"lead",event:"prompt",prompt:"lead task"});
  runtime.hookStateManager.injectEvent({...base,sessionId:"child",event:"turn_end",childId:"child-agent",childEvent:"stop"});
  expect(runtime.hookStateManager.getStatusForTerminal("a")).toMatchObject({sessionId:"lead",state:"working",lastPrompt:"lead task"});
  runtime.hookStateManager.injectEvent({...base,sessionId:"foreign",event:"turn_end"});
  expect(runtime.hookStateManager.getStatusForTerminal("a")).toMatchObject({sessionId:"lead",state:"working"});
 }finally{runtime.hookStateManager.dispose();runtime.promptStore.flushSync();rmSync(root,{recursive:true,force:true});}
});
