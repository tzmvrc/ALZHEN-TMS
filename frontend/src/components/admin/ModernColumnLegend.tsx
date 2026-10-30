import {categories,modernColumnCategory} from '../../services/modern-table-categories';

/** Categories use the current report columns; filtering never changes saved visibility. */
export default function ModernColumnLegend({columns,active,onChange,disabled=false,onSelect}:{columns:readonly {key:string;title:string}[];active:string;onChange:(category:string)=>void;disabled?:boolean;onSelect?:(key:string)=>void}){
  const present=new Set(columns.map(column=>modernColumnCategory(column.key,column.title).key));
  const selected=present.has(active as typeof categories[number]['key'])?active:'all';
  return <div className="ml-groups" role="group" aria-label="Column categories">{categories.filter(category=>present.has(category.key)).map(category=><button type="button" key={category.key} disabled={disabled} aria-pressed={selected===category.key} className={'ml-group '+(selected===category.key?'is-active':'')} onClick={()=>{onChange(category.key);const first=columns.find(column=>modernColumnCategory(column.key,column.title).key===category.key);if(first)onSelect?.(first.key);}}><span aria-hidden="true" className="ml-dot" style={{background:category.color}}/>{category.label}</button>)}<button type="button" disabled={disabled} className={'ml-group '+(selected==='all'?'is-active':'')} aria-pressed={selected==='all'} onClick={()=>{onChange('all');if(columns[0])onSelect?.(columns[0].key);}}><span aria-hidden="true" className="ml-dot ml-dot-all"/>All {columns.length}</button></div>;
}
