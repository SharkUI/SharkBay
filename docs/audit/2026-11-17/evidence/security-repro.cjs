const ts=require(require('node:path').resolve('node_modules/typescript'));
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'sharkbay-security-audit-')),source=process.argv[2] || '/tmp/sharkbay-audit-2fc9c93';
async function main(){
 for(const file of ['src/main/harness.ts','src/main/command-path.ts','src/server/session-auth.ts','src/shared/application-api.ts','src/main/teamwork-sync.ts','src/main/git.ts']){
  const out=path.join(root,'modules',file.replace(/\.ts$/,'.js'));
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.writeFile(out,ts.transpileModule(await fs.readFile(path.join(source,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText);
 }
 const {SessionAuth}=require(path.join(root,'modules/src/server/session-auth.js'));
 const auth=new SessionAuth();assert.equal(auth.authenticate(undefined,'10.0.0.42'),'lan');auth.revokeAll();assert.equal(auth.authenticate(undefined,'10.0.0.42'),'lan');
 console.log('AUTH: private LAN peer has full lan identity without grant/cookie, remains authorized after revokeAll');
 const {installHarness,reserveArtifactPath}=require(path.join(root,'modules/src/main/harness.js'));
 const scratch=await fs.mkdtemp(path.join(root,'case-'));
 const repo=path.join(scratch,'repo'),victim=path.join(scratch,'outside');await fs.mkdir(repo);await fs.mkdir(victim);await fs.symlink(victim,path.join(repo,'.sharkbay'));
 const options={githubLogin:'audit',githubUserId:1,machineId:'audit',agent:'',repo:'audit/fixture'};
 await installHarness(repo,options);assert.ok((await fs.stat(path.join(victim,'harness/protocol.md'))).isFile());
 console.log('SYMLINK: installHarness wrote protocol.md, scripts and machine-id outside configured repository via pre-existing .sharkbay symlink');
 const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
 const git=(...args)=>execFileSync('git',args,{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const base=path.join(scratch,'base'),wt=path.join(scratch,'wt');git('init',base);git('-C',base,'-c','user.name=Audit','-c','user.email=audit@example.invalid','commit','--allow-empty','-m','fixture');git('-C',base,'worktree','add',wt,'-b','audit-fixture');
 let error;try{await installHarness(wt,options)}catch(e){error=e}assert.equal(error?.code,'ENOTDIR');
 assert.ok((await fs.stat(path.join(wt,'.sharkbay/harness/protocol.md'))).isFile());
 console.log('WORKTREE: installHarness throws ENOTDIR for linked worktree after already creating .sharkbay content');
 const escaped=await reserveArtifactPath(base,'../../../outside/task');assert.ok(path.resolve(base,escaped).startsWith(victim+path.sep));
 console.log('TASK_PATH: reserveArtifactPath accepts taskId traversal and creates a randomized file outside repository');
 const {parseGitDirtyFiles}=require(path.join(root,'modules/src/main/git.js'));
 const unicode='中文文件.md';await fs.writeFile(path.join(base,unicode),'fixture');
 const porcelain=git('-C',base,'-c','core.quotePath=true','status','--porcelain=v1','-uall');
 const parsed=parseGitDirtyFiles(porcelain);assert.notEqual(parsed[0].path,unicode);
 console.log('GIT_PATH: C-quoted UTF-8 filename is not decoded to the real Chinese filename');
 const {TeamworkSync}=require(path.join(root,'modules/src/main/teamwork-sync.js'));
 const mirrorRepo=path.join(scratch,'mirror');await fs.mkdir(mirrorRepo);
 const sync=new TeamworkSync(mirrorRepo);let present=true;sync.git=async(args)=>args[0]==='ls-tree'?(present?'.sharkbay-team-context/tasks/2026/11/test.md':''):'---\nstatus: completed\n---\n';
 await sync.refreshMirrorFromRemote();present=false;await sync.refreshMirrorFromRemote();assert.ok((await fs.stat(path.join(mirrorRepo,'.sharkbay/team-context/tasks/2026/11/test.md'))).isFile());
 console.log('MIRROR: previously mirrored task remains on disk after successful empty remote listing');
 await fs.rm(scratch,{recursive:true,force:true});
 console.log('CLEANUP: all fixture repositories and files removed; no app/runtime/server/network started');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rm(root,{recursive:true,force:true}));
