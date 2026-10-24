import dotenv from '../backend/node_modules/dotenv/lib/main.js';
import {readFile} from 'node:fs/promises';
dotenv.config({path:'backend/.env',quiet:true});
const root=new URL(process.env.SUPABASE_URL);
if(root.hostname!=='hdmknewarynwpbrhfgai.supabase.co')throw Error('Project mismatch');
const config=await readFile('backend/src/config/master-list-columns.ts','utf8');
const displayed=[...config.slice(0,config.indexOf('const MASTER_HEADER_GROUPS')).matchAll(/key: "([^"]+)"/g)].map(match=>match[1]);
const mode=process.argv[2]??'projection';
const physical=['trip_id','_trip_id','_trip_stop_id','_trip_line_item_id','_assignment_id','_product_id','_warehouse_id','_customer_id','_store_id','_truck_id','_driver_id','_trucking_company_id','loading_date','transaction_archived_at','trip_status','transaction_number','stop_sequence','source_warehouse','sp_reference','ph_truck_reference','dn_reference','order_item_number','so_number','unit_cbm','stock_quantity','so_approval_date','item_status'];
const params=new URLSearchParams({select:mode==='all'?'*':mode==='ids'?'trip_id,_trip_stop_id,_trip_line_item_id,_assignment_id':[...new Set([...displayed,...physical])].join(','),order:'loading_date.desc,trip_id.asc.nullslast,_trip_stop_id.asc.nullslast,_assignment_id.asc.nullslast,_trip_line_item_id.asc.nullslast',limit:'200'});
const start=performance.now(),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
try {
 const response=await fetch(new URL('/rest/v1/v_trip_master_csv?'+params,root),{headers:{apikey:key,Authorization:'Bearer '+key,Prefer:'count=exact'},signal:AbortSignal.timeout(20000)});
 const body=await response.json();
 console.log(JSON.stringify({mode,status:response.status,ms:Math.round(performance.now()-start),range:response.headers.get('content-range'),rows:Array.isArray(body)?body.length:undefined,error:Array.isArray(body)?undefined:body}));
} catch(error){console.log(JSON.stringify({mode,ms:Math.round(performance.now()-start),error:error.message}));process.exitCode=1;}
