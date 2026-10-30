import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {useReportContextActions} from '../src/components/admin/useReportContextActions';

/** Isolated in-memory records: never calls ALZHEN APIs or changes operational data. */
export async function checkContextHistory(){
  const errors:string[]=[];
  let api:{change:(value:string)=>Promise<boolean>;external:(value:string)=>void;scope:()=>void;value:string;actions:ReturnType<typeof useReportContextActions<{id:string;note:string}>>['actions']}|undefined;
  function Harness(){
    const [rows,setRows]=useState([{id:'row-1',note:'Original'}]);
    const [scope,setScope]=useState('account-1');
    const write=async(row:typeof rows[number],column:string,value:string)=>{setRows(current=>current.map(item=>item.id===row.id?{...item,[column]:value}:item));context.record(row.id,column,row.note,value);return true;};
    const context=useReportContextActions({scope,rows,columns:[{key:'note'}],identity:row=>row.id,value:row=>row.note,editable:()=>true,write,selection:new Set(['row-1\u0000note']),focus:{row:'row-1',column:'note'},enabled:true,onError:message=>errors.push(message)});
    api={change:value=>write(rows[0],'note',value),external:value=>setRows([{id:'row-1',note:value}]),scope:()=>setScope('account-2'),value:rows[0].note,actions:context.actions};
    return null;
  }
  const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  const settle=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const check=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
  const action=(name:string)=>api!.actions.find(action=>action.label===name)!;
  try{
    flushSync(()=>root.render(<Harness/>));await settle();
    check(action('Undo').disabled,'Undo starts disabled');
    await api!.change('Edited');await settle();check(!action('Undo').disabled,'Undo available after edit: '+JSON.stringify({value:api!.value,errors}));
    await action('Undo').onClick();await settle();check(api!.value==='Original','Undo restores original value: '+JSON.stringify({value:api!.value,errors}));
    await action('Redo').onClick();await settle();check(api!.value==='Edited','Redo restores edited value');
    api!.external('Newer collaborator value');await settle();
    await action('Undo').onClick();await settle();check(api!.value==='Newer collaborator value'&&errors.length===1,'Undo must preserve a newer collaborator edit');
    api!.scope();await settle();check(action('Undo').disabled&&action('Redo').disabled,'History must clear when account/sheet scope changes');
    return {undo:true,redo:true,collaboratorConflictProtected:true,historyScopeIsolated:true};
  }finally{root.unmount();node.remove();}
}
