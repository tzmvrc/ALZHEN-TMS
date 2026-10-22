import {SpreadsheetRowNumber} from "./SpreadsheetPresentation";

/** One gutter cell; never introduces another selection column. */
export default function SpreadsheetRowSelectionHeader({active, checked, partial, disabled, onChange, label="Select all matching rows"}: {
 active:boolean;checked:boolean;partial:boolean;disabled?:boolean;onChange:(checked:boolean)=>void;label?:string;
}) {
 return active ? <input type="checkbox" className="spreadsheet-row-checkbox h-3.5 w-3.5 cursor-pointer accent-blue-600 disabled:opacity-50" aria-label={label} aria-checked={partial?"mixed":checked} checked={checked} ref={element=>{if(element)element.indeterminate=partial;}} disabled={disabled} onChange={event=>onChange(event.target.checked)}/>
  : <button type="button" className="w-full text-center focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50" aria-label={label} title={label} disabled={disabled} onClick={()=>onChange(true)}><SpreadsheetRowNumber value="#"/></button>;
}
