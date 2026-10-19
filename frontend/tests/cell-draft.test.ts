import test from "node:test";import assert from "node:assert/strict";
import {beginCellDraft,cellDraftSnapshot,clearCellDrafts,configureDraftTransport,draftConnection,endRemoteCellDraft,receiveCellDraft,subscribeCellDraft,noteDraftCommit,cellDraftConflict} from "../src/services/cell-draft.service.ts";
const target={table:"combined",source:"trip_stops",recordId:"stop-a",field:"remarks"};
test("trailing throttle sends latest text, flushes at save, and never uses HTTP or database APIs",async()=>{
 clearCellDrafts();const sent:Array<{event:string;value:any}>=[];
 configureDraftTransport((event,value,ack)=>{sent.push({event,value});ack?.({ok:true});});draftConnection(true);
 const editor=beginCellDraft(target,"old",50);
 for(let n=1;n<=100;n++)editor.update(`typed-${n}`);
 assert.equal(sent.filter(v=>v.event==="cell:draft-changed").length,0);
 await new Promise(resolve=>setTimeout(resolve,65));assert.equal(sent.at(-1)!.value.value,"typed-100");
 editor.update("final");editor.state("saving");assert.equal(sent.at(-1)!.value.value,"final");assert.equal(sent.at(-1)!.value.phase,"saving");
 editor.close();const count=sent.length;await new Promise(resolve=>setTimeout(resolve,65));assert.equal(sent.length,count);assert.equal(sent.at(-1)!.event,"cell:edit-end");clearCellDrafts();configureDraftTransport(null);
});
test("remote keystrokes notify only the exact cell, with sequence/cancel/stop/report isolation",()=>{
 clearCellDrafts();let changed=0,other=0;const unsub=subscribeCellDraft(target,()=>changed++);
 const cleanup=Array.from({length:5000},(_,n)=>subscribeCellDraft({...target,recordId:`other-${n}`},()=>other++));
 const value={target,socketId:"remote",sessionId:"session",sequence:1,value:"A",phase:"editing" as const,userId:"staff",name:"Staff",color:"blue"};
 receiveCellDraft(value);receiveCellDraft({...value,sequence:2,value:"AB"});receiveCellDraft({...value,value:"old"});
 assert.equal(cellDraftSnapshot(target)[0]!.value,"AB");assert.equal(changed,2);assert.equal(other,0);
 assert.equal(cellDraftSnapshot({...target,table:"dispatch"}).length,0);assert.equal(cellDraftSnapshot({...target,recordId:"stop-b"}).length,0);
 endRemoteCellDraft({socketId:"remote",sessionId:"session",sequence:3});receiveCellDraft({...value,sequence:4,value:"late"});assert.equal(cellDraftSnapshot(target).length,0);
 unsub();cleanup.forEach(fn=>fn());clearCellDrafts();
});
test("reconnect creates a fresh ephemeral session; logout cancels timers and conflicts preserve local text",()=>{
 clearCellDrafts();const sent:any[]=[];configureDraftTransport((event,value,ack)=>{sent.push({event,...value as object});ack?.({ok:true});});draftConnection(true);
 const editor=beginCellDraft(target,"local");const old=sent[0].sessionId;
 editor.update("unsaved");noteDraftCommit({source:target.source,recordId:target.recordId,fields:[target.field],actorId:"other"},"self");assert.match(cellDraftConflict(target)!,/preserved/);
 draftConnection(false);editor.update("offline-local");draftConnection(true);assert.notEqual(sent.at(-1).sessionId,old);assert.equal(sent.at(-1).value,"offline-local");
 clearCellDrafts();const count=sent.length;editor.update("after logout");assert.equal(sent.length,count);configureDraftTransport(null);
});

test("a room snapshot received before reconnect acknowledgement survives; stale end cannot erase newer text",()=>{
 clearCellDrafts();const value={target,socketId:"snapshot-peer",sessionId:"snapshot-session",sequence:5,value:"restored unsaved",phase:"editing" as const,userId:"peer",name:"Peer",color:"blue"};
 receiveCellDraft(value);draftConnection(true);assert.equal(cellDraftSnapshot(target)[0]?.value,"restored unsaved");
 endRemoteCellDraft({socketId:value.socketId,sessionId:value.sessionId,sequence:4});assert.equal(cellDraftSnapshot(target)[0]?.sequence,5);
 draftConnection(false);assert.equal(cellDraftSnapshot(target).length,0);clearCellDrafts();
});

test("oversized drafts remain local, remove an older preview and never transmit truncated text",()=>{
 clearCellDrafts();const sent:any[]=[];configureDraftTransport((event,value,ack)=>{sent.push({event,...value as object});ack?.({ok:true});});draftConnection(true);
 const editor=beginCellDraft(target,"small");editor.update("x".repeat(8193));editor.state("saving");
 assert.equal(sent.at(-1).event,"cell:edit-end");assert.ok(sent.every(value=>!value.value||value.value.length<=8192));assert.match(cellDraftConflict(target)!,/complete local draft/);
 editor.close();clearCellDrafts();configureDraftTransport(null);
});
