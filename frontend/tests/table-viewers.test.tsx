import test from "node:test";
import React from "react";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {ViewerGroup,ViewerAvatar} from "../src/components/admin/TableViewers";
test("viewer avatars show three circles plus overflow, safe images and name initials",()=>{
 const users=Array.from({length:5},(_,n)=>({userId:String(n),name:`User ${n}`,color:"#123456",avatarUrl:null}));
 const html=renderToStaticMarkup(<ViewerGroup users={users}/>);
 assert.match(html,/5 people viewing this table/);assert.match(html,/\+2/);assert.equal((html.match(/>U<\/span>/g)??[]).length,3);
 assert.equal(renderToStaticMarkup(<ViewerGroup users={[]}/>),"");
 assert.match(renderToStaticMarkup(<ViewerAvatar user={{...users[0],avatarUrl:"https://example.invalid/signed-avatar"}}/>),/<img/);
});
