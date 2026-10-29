import {useState} from 'react';
import {parseSerialLines,type PodSerialGroup} from '../../services/pod-serials';
import './pod-serials.css';

export default function PodSerialReview({groups,quantities,selected,onChange,disabled=false}:{groups:PodSerialGroup[];quantities:Record<string,string|number>;selected:string[];onChange?:(group:PodSerialGroup)=>void;disabled?:boolean}){
 const [message,setMessage]=useState('');
 return <section className="pod-serial-review">
  <h3>Product serial numbers (optional)</h3>
  {!groups.length&&<p>No serial numbers detected. Select a product to add them manually if needed.</p>}
  {groups.map(group=>{
   const count=new Set(group.serials).size,quantity=group.model?quantities[group.model]:undefined;
   const mismatch=!!group.model&&selected.includes(group.model)&&quantity!==undefined&&count>0&&String(quantity).trim()!==''&&Number(quantity)!==count;
   return <details key={group.id}>
    <summary>{group.model??'Unassigned / Needs Review'} — {count} serial numbers{group.uncertain_serials.length>0?` + ${group.uncertain_serials.length} need review`:''} <span>View / Edit</span></summary>
    <div className="pod-serial-body">
     {group.heading!==group.model&&<small>{group.heading}</small>}
     {group.uncertain_serials.length>0&&<p role="status">{group.uncertain_serials.length} uncertain entries need checking; they are not counted as confirmed serials.</p>}
     {mismatch&&<p role="status">{count} unique serials; POD quantity {quantity}. Review the difference. Quantity has not been changed.</p>}
     {group.receiptQuantities.length>0&&<small>Printed receipt quantities: {group.receiptQuantities.join(', ')}</small>}
     <label>Serial numbers for {group.model??'Unassigned / Needs Review'}
      <textarea rows={6} spellCheck={false} autoCapitalize="off" autoCorrect="off" readOnly={!onChange} disabled={disabled} value={group.editText??group.serials.join('\n')} onChange={event=>{const parsed=parseSerialLines(event.target.value);onChange?.({...group,serials:parsed.serials,uncertain_serials:[...new Set([...group.uncertain_serials,...parsed.uncertain_serials])],editText:event.target.value,removedSerials:[...new Set([...(group.removedSerials??[]),...group.serials.filter(value=>!parsed.serials.includes(value))])]});}}/>
     </label>
     {group.uncertain_serials.length>0&&<label>Needs review for {group.model??'Unassigned / Needs Review'}
      <textarea rows={5} spellCheck={false} autoCapitalize="off" autoCorrect="off" readOnly={!onChange} disabled={disabled} value={group.uncertainText??group.uncertain_serials.join('\n')} onChange={event=>{const values=[...new Set(event.target.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean))];onChange?.({...group,uncertain_serials:values,uncertainText:event.target.value,removedSerials:[...new Set([...(group.removedSerials??[]),...group.uncertain_serials.filter(value=>!values.includes(value))])]});}}/>
     </label>}
     {onChange&&group.uncertain_serials.length>0&&<button type="button" disabled={disabled} onClick={()=>{const reviewed=parseSerialLines(group.uncertainText??group.uncertain_serials.join('\n'));onChange({...group,serials:[...new Set([...group.serials,...reviewed.serials])],uncertain_serials:reviewed.uncertain_serials,uncertainText:reviewed.uncertain_serials.join('\n'),editText:undefined});}}>Use reviewed serials</button>}
     <small>One serial per line. Keep exact characters and leading zeros. Entries needing review stay separate until you explicitly confirm them.</small>
     <button type="button" disabled={disabled} onClick={()=>{if(!navigator.clipboard){setMessage('Copy unavailable. Select and copy the list manually.');return;}void navigator.clipboard.writeText([...group.serials,...group.uncertain_serials].join('\n')).then(()=>setMessage('Serial numbers copied.'),()=>setMessage('Copy unavailable. Select and copy the list manually.'));}}>Copy serial numbers</button>
    </div>
   </details>;
  })}
  {message&&<p role="status">{message}</p>}
 </section>;
}
