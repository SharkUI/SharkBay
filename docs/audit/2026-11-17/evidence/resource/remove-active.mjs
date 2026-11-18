import {CodeGraphManager} from './src/core/codegraph-manager.js';
let release,syncStarted,signal;const entered=new Promise(r=>syncStarted=r);const calls=[];
const m=new CodeGraphManager(async()=>'/fixture/codegraph',async(command,args,options)=>{calls.push(args[0]);if(args[0]==='status')return{stdout:JSON.stringify({initialized:true,pendingChanges:{modified:calls.includes('sync')?0:1}}),stderr:''};if(args[0]==='sync'){signal=options.signal;syncStarted();await new Promise(r=>release=r)}return{stdout:'',stderr:''}});
const pending=m.ensureProjectStatus('local:/tmp/sharkbay-audit-resource-repro/nonexistent',true);await entered;
await m.removeProjectIndexes(['local:/tmp/sharkbay-audit-resource-repro/nonexistent']);
console.log(JSON.stringify({case:'remove_active_index',calls,aborted:signal.aborted,hasActiveJobs:m.hasActiveJobs()}));release();await pending;
