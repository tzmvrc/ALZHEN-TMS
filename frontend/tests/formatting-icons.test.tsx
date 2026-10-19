import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ReportCellFormattingToolbar} from "../src/components/admin/ReportSpreadsheetShared";

test("Italic and Underline share unboxed styles, accessible toggles and unchanged toolbar sizing",()=>{
 for(const active of [false,true]){
  const html=renderToStaticMarkup(<ReportCellFormattingToolbar advanced selectedCellCount={1} selectionIsBold={false} selectionIsItalic={active} selectionIsUnderlined={active} selectedTextColor={null} selectedBackgroundColor={null} onApply={()=>{}}/>);
  for(const name of ["Italic","Underline"]){
   const button=html.match(new RegExp(`<button[^>]*title="${name} selected cells"[^>]*>`))?.[0];assert.ok(button);
   assert.match(button,/border-0 bg-transparent p-0 shadow-none/);assert.match(button,/h-7 w-7/);assert.match(button,/focus-visible:outline-2/);
   assert.ok(button.includes(`aria-pressed="${active}"`));assert.ok(button.includes(active?"text-blue-700":"text-slate-500"));
   assert.ok(!button.includes("rounded"));assert.ok(!button.includes("hover:bg-"));
  }
  const bold=html.match(/<button[^>]*title="Bold selected cells"[^>]*>/)?.[0];assert.match(bold!,/rounded border/);
 }
});
