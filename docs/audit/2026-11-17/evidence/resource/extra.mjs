import {runCodeGraphCommandInGroup} from './src/core/codegraph-manager.js';
import {createCoreMachineDetector} from './src/plugins/bundled/core-detectors.js';
const result=await runCodeGraphCommandInGroup(process.execPath,['-e',"process.kill(process.pid,'SIGTERM')"],{cwd:'/tmp/sharkbay-audit-resource-repro',timeout:1000});
console.log(JSON.stringify({case:'signalled_command',resolved:true,result}));
const d=createCoreMachineDetector();const m=await d.run({run:async c=>({stdout:c.startsWith('uname')?'Darwin 26.1.0 arm64':c.startsWith('hostname')?'fixture':'/bin/zsh',stderr:'',exitCode:0})});
console.log(JSON.stringify({case:'uname_fields',actual:m.os,expected:{version:'26.1.0',arch:'arm64',kernel:'26.1.0'}}));
