export const categories = [
  {key:'booking',label:'Booking',pattern:/dispatch|booking|transaction|trip|request|customer|client/,color:'#0f9d8a',background:'#edf8f5'},
  {key:'warehouse',label:'Warehouse',pattern:/warehouse|loading|\bwh\b|departure/,color:'#806124',background:'#faf5e8'},
  {key:'cargo',label:'Cargo',pattern:/cargo|product|model|quantity|qty|cbm|sku|item|receipt|\bdr\b/,color:'#7c5cc4',background:'#f3eef9'},
  {key:'calling',label:'Calling',pattern:/call|contact|phone/,color:'#37694b',background:'#edf7f0'},
  {key:'transmittal',label:'Transmittal',pattern:/transmittal|tracking|\bpod\b|signed|shipping|lbc/,color:'#376b78',background:'#edf7fa'},
  {key:'delivery',label:'Delivery',pattern:/delivery|delivered|store|stop|address|arrival|unload|province|city|region/,color:'#1e2a4a',background:'#eef1f8'},
  {key:'transport',label:'Transport',pattern:/truck|plate|driver|helper|crew|trucker|subcon/,color:'#6a5d44',background:'#f6f3ec'},
  {key:'other',label:'Other',pattern:/.*/,color:'#596579',background:'#f2f4f7'},
] as const;

export function modernColumnCategory(key:string,title:string){
  const text=`${key.replaceAll('_',' ')} ${title}`.toLowerCase();
  const titleMatch=categories.find(category=>category.key!=='other'&&category.key!=='booking'&&category.pattern.test(title.toLowerCase()));
  return titleMatch??categories.find(category=>category.pattern.test(text))!;
}

export function modernColumnHeaderStyle(key:string,title:string,topColor?:string){
  const category=modernColumnCategory(key,title);
  return {backgroundColor:"#ffffff",color:"#5b6b85",borderTop:`3px solid ${topColor||category.color}`,height:62,fontSize:12,fontWeight:700,letterSpacing:'.02em',textTransform:'uppercase' as const};
}

export function modernCategoryColumns<T extends {key:string;title:string}>(columns:T[],category:string):T[]{
  if(category==='all')return columns;
  const matching=columns.filter(column=>modernColumnCategory(column.key,column.title).key===category);
  return matching.length?matching:columns;
}
