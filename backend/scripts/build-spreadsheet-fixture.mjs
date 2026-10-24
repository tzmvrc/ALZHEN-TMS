// Production-mode UI fixtures in ignored output; never replaces the application build.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../frontend',import.meta.url));
const output=fileURLToPath(new URL('../../.playwright-mcp/spreadsheet-fixture-dist',import.meta.url));
const auth=fileURLToPath(new URL('../../.playwright-mcp/spreadsheet-fixture-auth.ts',import.meta.url));
await mkdir(resolve(output,'..'),{recursive:true});
const columnsDirectory=resolve(output,'../spreadsheet-columns');await mkdir(columnsDirectory,{recursive:true});
const reportsModule=await import('../src/config/reports.ts'),masterModule=await import('../src/config/master-list-columns.ts');
const definitions=(reportsModule.default??reportsModule).REPORT_DEFINITIONS;
for(const [key,definition] of Object.entries(definitions)){
 const columns=key==='dispatch-monitoring'?(masterModule.default??masterModule).MASTER_LIST_COLUMNS:definition.columns;
 await writeFile(resolve(columnsDirectory,key+'.json'),JSON.stringify({success:true,data:{report:key,columns}}));
}
const actor={id:'f0241024-0000-4000-9000-000000000001',first_name:'Isolated',last_name:'UI fixture',email:'fixture@example.invalid',role:'ADMIN',is_admin:true,account_status:'ACTIVE'};
await writeFile(auth,`const session=${JSON.stringify({user:{id:actor.id},profile:actor,accessToken:'isolated-ui-fixture',loading:false})};export function AuthProvider({children}:any){return children;}export const getRoleBasedHomePath=()=>'/';export const useAuth=()=>session;`);
const {build}=await import(pathToFileURL(resolve(root,'node_modules/vite/dist/node/index.js')).href);
await build({root,configFile:resolve(root,'vite.config.ts'),resolve:{alias:[{find:/^.*\/context\/AuthContext(?:\.tsx)?$/,replacement:auth}]},build:{outDir:output,emptyOutDir:true,reportCompressedSize:false}});
console.log('Isolated UI fixture compiled. All browser API calls must remain intercepted.');
