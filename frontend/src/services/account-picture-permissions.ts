/** Display policy only. Backend independently rechecks active accounts and roles. */
export function canChangeAccountPicture(viewer:{id:string;role:string}|null|undefined,subject:{id:string;role:string;account_status?:unknown;deactivated_at?:unknown}){
 return Boolean(viewer&&["ADMIN","STAFF","TRUCKER"].includes(viewer.role)&&!subject.deactivated_at&&subject.account_status!=="DEACTIVATED"&&(viewer.id===subject.id||subject.role==="TRUCKER"&&["ADMIN","STAFF"].includes(viewer.role)));
}
