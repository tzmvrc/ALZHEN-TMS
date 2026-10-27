/** One gutter cell; never introduces another selection column. */
export default function SpreadsheetRowSelectionHeader({checked, partial, disabled, onChange, label="Select all matching rows"}: {
 active:boolean;checked:boolean;partial:boolean;disabled?:boolean;onChange:(checked:boolean)=>void;label?:string;
}) {
 return <input type="checkbox" className="spreadsheet-row-checkbox h-3.5 w-3.5 cursor-pointer accent-[#0b2343] disabled:opacity-50" aria-label={label} title={label} aria-checked={partial?"mixed":checked} checked={checked} ref={element=>{if(element)element.indeterminate=partial;}} disabled={disabled} onChange={event=>onChange(event.target.checked)}/>;
}
