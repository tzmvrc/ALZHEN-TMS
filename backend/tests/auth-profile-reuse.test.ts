import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseAdmin as db} from '../src/config/supabase.js';
import {getCurrentUserProfile} from '../src/services/auth.service.js';
test('session bootstrap reuses only the same-request verified profile and never trusts a different profile identity',async()=>{
 const from=db.from;let reads=0;const profile:any={id:'same-user',role:'ADMIN',profile_picture_path:null};
 db.from=(()=>{reads++;const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:profile,error:null})};return query;}) as typeof from;
 try{assert.equal((await getCurrentUserProfile('same-user',profile)).id,'same-user');assert.equal(reads,0);await getCurrentUserProfile('same-user',{...profile,id:'another-user'});assert.equal(reads,1);}finally{db.from=from;}
});
