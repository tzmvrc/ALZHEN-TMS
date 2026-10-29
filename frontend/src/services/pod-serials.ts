import type {AutomaticPodReading} from './pod-auto-read.service';
import {matchPodModels} from './pod-model-matching';
export type PodSerialGroup={id:string;model:string|null;heading:string;serials:string[];uncertain_serials:string[];sourcePages:string[];receiptQuantities:number[];editText?:string;uncertainText?:string;removedSerials?:string[]};
export type PodScanStatus='pending'|'reading'|'scanned'|'partial'|'failed';
export type PodSerialMetadata={version:1;groups:PodSerialGroup[];pages:Array<{id:string;page_number:number;name:string;status:PodScanStatus;attachmentId?:string}>;conflicts:{dr:string[];date:string[]};conflictsReviewed:boolean};
export const uniqueSerials=(values:string[])=>[...new Set(values.map(value=>value.trim()).filter(Boolean))];
export function parseSerialLines(text:string){const values=uniqueSerials(text.split(/\r?\n/));return {serials:values.filter(value=>/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)),uncertain_serials:values.filter(value=>!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value))};}
export function combinePodPages(pages:Array<{id:string;result?:AutomaticPodReading}>,options:string[],aliases:Record<string,string[]>){
 const usable=pages.filter((page):page is {id:string;result:AutomaticPodReading}=>!!page.result&&page.result.state!=='UNREADABLE'&&page.result.state!=='INVALID');
 const distinct=(key:'dr'|'date')=>[...new Set(usable.flatMap(page=>[page.result.fields[key],...(page.result.conflicts?.[key]??[])]).filter(Boolean))];
 const dr=distinct('dr'),date=distinct('date'),detected=uniqueSerials(usable.flatMap(page=>[...page.result.fields.models.split(','),...(page.result.serial_groups??[]).filter(group=>group.association_clear&&group.model).map(group=>group.model!)]));
 const receiptModels=matchPodModels(usable.filter(page=>page.result.fields.dr||page.result.fields.receiver).flatMap(page=>page.result.fields.models.split(',')),options,aliases).matched;
 const match=matchPodModels(detected,options,aliases),groups=new Map<string,PodSerialGroup>();
 for(const page of usable)for(const source of page.result.serial_groups??[]){const assigned=source.association_clear&&source.model?matchPodModels([source.model],options,aliases).matched:matchPodModels([source.heading],receiptModels,aliases).matched,model=assigned.length===1?assigned[0]:null,id=model?`model:${model}`:'review';
  const old=groups.get(id)??{id,model,heading:model??'Unassigned / Needs Review',serials:[],uncertain_serials:[],sourcePages:[],receiptQuantities:[]};
  if(!model&&source.heading&&!old.heading.includes(source.heading))old.heading+=` ? ${source.heading}`;
  old.serials.push(...source.serials);old.uncertain_serials.push(...source.uncertain_serials);old.sourcePages.push(page.id);if(source.quantity!==null)old.receiptQuantities.push(source.quantity);groups.set(id,old);
 }
 return {fields:{dr:dr.length===1?dr[0]:'',receiver:usable.map(page=>page.result.fields.receiver).find(Boolean)??'',date:date.length===1?date[0]:'',models:match.matched.join(', ')},unmatched:match.unmatched,groups:[...groups.values()],conflicts:{dr,date}};
}
export function dedupeSerialGroups(input:PodSerialGroup[]){
 const groups=input.map(group=>({...group,serials:uniqueSerials(group.serials),uncertain_serials:uniqueSerials(group.uncertain_serials),sourcePages:[...new Set(group.sourcePages)],receiptQuantities:[...new Set(group.receiptQuantities)]}));
 const owners=new Map<string,Set<string>>();for(const group of groups)for(const serial of group.serials){const set=owners.get(serial)??new Set<string>();set.add(group.model??'review');owners.set(serial,set);}
 const conflicts=[...owners].filter(([,models])=>models.size>1).map(([serial])=>serial);let review=groups.find(group=>group.id==='review');
 if(conflicts.length){if(!review){review={id:'review',model:null,heading:'Unassigned / Needs Review',serials:[],uncertain_serials:[],sourcePages:[],receiptQuantities:[]};groups.push(review);}for(const group of groups)if(group.model)group.serials=group.serials.filter(serial=>!conflicts.includes(serial));review.serials=uniqueSerials([...review.serials,...conflicts]);}
 return {groups,conflicts};
}
export function reviewedSerialGroups(pages:Array<{id:string;result?:AutomaticPodReading}>,options:string[],aliases:Record<string,string[]>,edits:Record<string,PodSerialGroup>){
 const automatic=combinePodPages(pages,options,aliases).groups,combined=new Map(automatic.map(group=>[group.id,group]));
 for(const edit of Object.values(edits)){
  const later=combinePodPages(pages.filter(page=>!edit.sourcePages.includes(page.id)),options,aliases).groups.find(group=>group.id===edit.id),added=(later?.serials??[]).filter(value=>!edit.removedSerials?.includes(value)&&!edit.serials.includes(value));
  const addedUncertain=(later?.uncertain_serials??[]).filter(value=>!edit.removedSerials?.includes(value)&&!edit.uncertain_serials.includes(value));
  combined.set(edit.id,{...edit,serials:uniqueSerials([...edit.serials,...added]),uncertain_serials:uniqueSerials([...edit.uncertain_serials,...addedUncertain]),sourcePages:[...new Set([...edit.sourcePages,...(later?.sourcePages??[])])],...(edit.editText!==undefined&&added.length?{editText:edit.editText+'\n'+added.join('\n')}:{}),...(edit.uncertainText!==undefined&&addedUncertain.length?{uncertainText:edit.uncertainText+'\n'+addedUncertain.join('\n')}:{} )});
 }
 return dedupeSerialGroups([...combined.values()]);
}

export function readPodSerialMetadata(input:unknown):PodSerialMetadata|undefined{
 if(!input||typeof input!=='object')return;const root=input as Record<string,unknown>;if(root.version!==1||!Array.isArray(root.groups)||!Array.isArray(root.pages))return;
 const strings=(value:unknown)=>Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'&&v.length<=300):[];
 const groups:PodSerialGroup[]=root.groups.filter(value=>value&&typeof value==='object').map(value=>({id:typeof value.id==='string'?value.id:'review',model:typeof value.model==='string'?value.model:null,heading:typeof value.heading==='string'?value.heading:'Unassigned / Needs Review',serials:uniqueSerials(strings(value.serials)),uncertain_serials:uniqueSerials(strings(value.uncertain_serials)),sourcePages:strings(value.sourcePages),receiptQuantities:Array.isArray(value.receiptQuantities)?value.receiptQuantities.filter((v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0):[]}));
 const statuses=['pending','reading','scanned','partial','failed'];const pages=root.pages.filter(value=>value&&typeof value.id==='string'&&typeof value.name==='string').map((value,index)=>({id:value.id,page_number:index+1,name:value.name,status:statuses.includes(value.status)?value.status as PodScanStatus:'partial' as PodScanStatus,...(typeof value.attachmentId==='string'?{attachmentId:value.attachmentId}:{})}));
 const conflicts=root.conflicts&&typeof root.conflicts==='object'?root.conflicts as Record<string,unknown>:{};
 return {version:1,groups,pages,conflicts:{dr:strings(conflicts.dr),date:strings(conflicts.date)},conflictsReviewed:root.conflictsReviewed===true};
}
