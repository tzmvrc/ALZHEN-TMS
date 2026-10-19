import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {CollaborativeCell} from "../src/components/admin/CollaborativeCell";
import {beginCellDraft,clearCellDrafts,receiveCellDraft,endRemoteCellDraft} from "../src/services/cell-draft.service";

const target={table:"combined",source:"trip_stops",recordId:"stop-a",field:"remarks"};
const user={userId:"staff-a",name:"Staff A",color:"#123456",status:"selected"};
const draft={target,sessionId:"editor-a",socketId:"tab-a",sequence:1,value:"Live draft",phase:"editing" as const,...user};
const render=(presence=[user])=>renderToStaticMarkup(<CollaborativeCell target={target} selectionPresence={presence}><span>Confirmed</span></CollaborativeCell>);

test("selection alone and subsequent typing use one unchanged selection-style identity label",()=>{
 clearCellDrafts();
 try{
  const selected=render();assert.equal((selected.match(/data-cell-presence=/g)??[]).length,1);assert.match(selected,/>Staff A</);assert.ok(!selected.includes("data-live-draft="));
  assert.match(selected,/absolute right-1 -top-1\.5 z-30/);assert.match(selected,/pointer-events-none/);assert.match(selected,/overflow-visible/);
  receiveCellDraft(draft);const typing=render();assert.equal((typing.match(/data-cell-presence=/g)??[]).length,1);
  assert.match(typing,/data-live-draft-value="Live draft"/);assert.match(typing,/>Live draft</);
  const preview=typing.match(/<span role="note"[\s\S]*?<\/span><\/span>/)?.[0]??"";
  assert.ok(preview);assert.ok(!preview.replace(/title="[^"]*"/,"").includes("Staff A"),"draft content has no second visible username");
  assert.ok(!preview.includes("border-2"),"existing selection border is not duplicated");
  endRemoteCellDraft({socketId:draft.socketId,sessionId:draft.sessionId,sequence:2});assert.ok(!render().includes("data-live-draft="));assert.match(render(),/>Staff A</);
 }finally{clearCellDrafts();}
});

test("same-user tabs are deduplicated and distinct collaborators remain identifiable",()=>{
 clearCellDrafts();
 try{
  receiveCellDraft(draft);receiveCellDraft({...draft,socketId:"second-tab",sessionId:"another-editor"});
  assert.ok(!render().includes("+1"),"one person selecting and editing in multiple tabs is not multiple users");
  receiveCellDraft({...draft,socketId:"tab-b",sessionId:"editor-b",userId:"staff-b",name:"Staff B",value:"Other draft"});
  const html=render();assert.equal((html.match(/data-cell-presence=/g)??[]).length,1);assert.match(html,/\+1/);assert.match(html,/Staff B \(editing; draft shown\)/);
  const local=beginCellDraft(target,"My independent input");const active=render();assert.match(active,/Unsaved: Other draft/);assert.ok(!active.includes("Staff B · unsaved"));local.close();
  assert.equal((render([]).match(/data-cell-presence=/g)??[]).length,1,"tables without a separate presence renderer use the same sole indicator");
  clearCellDrafts();assert.ok(!render([]).includes("data-cell-presence="));
 }finally{clearCellDrafts();}
});
