import test from 'node:test';
import assert from 'node:assert/strict';
import {saveLoginPreference,loginPreference,rememberedAccount,forgetLoginPreference} from '../src/services/remembered-login.ts';
test('device choices are account scoped, persist declined consent and store display identity without credentials',()=>{
 const records=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>records.set(key,value),removeItem:(key:string)=>records.delete(key)}});
 const helper={id:'helper',first_name:'Mark',last_name:'Helper',role:'TRUCKER',crew_role:'HELPER',password:'MUST-NOT-PERSIST',access_token:'NO-AUTH-TOKEN'};
 assert.equal(loginPreference(helper.id),undefined);saveLoginPreference(helper,'helper@example.test',false);assert.equal(loginPreference(helper.id),false);assert.equal(rememberedAccount(),null);
 saveLoginPreference(helper,'helper@example.test',true);assert.equal(rememberedAccount()?.crew_role,'HELPER');assert.equal(rememberedAccount()?.name,'Mark Helper');assert.equal([...records.values()].some(v=>v.includes('MUST-NOT-PERSIST')||v.includes('NO-AUTH-TOKEN')),false);
 saveLoginPreference({id:'admin',first_name:'Admin',role:'ADMIN',crew_role:'DRIVER'},'admin@example.test',true);assert.equal(rememberedAccount()?.crew_role,null);
 forgetLoginPreference('helper');assert.equal(loginPreference('helper'),undefined);assert.equal(rememberedAccount()?.id,'admin');forgetLoginPreference('admin');assert.equal(rememberedAccount(),null);assert.equal(loginPreference('admin'),undefined);
});
