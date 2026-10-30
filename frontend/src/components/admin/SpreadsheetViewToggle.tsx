import "./SpreadsheetViewToggle.css";

export default function SpreadsheetViewToggle({checked,onChange,className=""}:{checked:boolean;onChange:(checked:boolean)=>void;className?:string}){
  return <label className={`spreadsheet-view-toggle ${className}`}>
    <span>Spreadsheet</span>
    <input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)} aria-label="Spreadsheet view"/>
    <span className="spreadsheet-view-toggle-track" aria-hidden="true"/>
  </label>;
}
