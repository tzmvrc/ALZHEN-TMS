import {useState,type ComponentProps} from 'react';
import {TripTableFullFormatToolbar} from './TripTableFullFormatToolbar';
import type {ReportCellFormat} from './ReportSpreadsheetUtils';
import {TripTableFormattingToolbar as ReportCellFormattingToolbar} from './TripTableFormattingToolbar';

type Props=ComponentProps<typeof ReportCellFormattingToolbar>&{
  modern:boolean;active:boolean;reserveSpace?:boolean;cellSelected:boolean;label:string;selectedFormat?:ReportCellFormat;selectedFontFamily?:string;canFormat?:boolean;onSetRowHeight?:(height:number)=>void;onSetColumnWidth?:(width:number)=>void;
};

/** Reuses the existing editors and formatting persistence in Master List's layout. */
export default function ModernCellControls({modern,active,reserveSpace=false,cellSelected,label,formulaBar,selectedFormat={},selectedFontFamily="Inter",canFormat=true,onSetRowHeight,onSetColumnWidth,...toolbar}:Props){
  const [copied,setCopied]=useState<ReportCellFormat|null>(null);
  const count=canFormat?toolbar.selectedCellCount:0;
  const currentFormat={...selectedFormat,bold:toolbar.selectionIsBold,italic:toolbar.selectionIsItalic,underline:toolbar.selectionIsUnderlined,color:toolbar.selectedTextColor,backgroundColor:toolbar.selectedBackgroundColor,fontSize:toolbar.selectedFontSize,fontFamily:selectedFontFamily};

  // Keep the grid under the pointer while a first click reveals cell controls.
  if(!active&&!reserveSpace)return null;
  return <div className="modern-cell-controls" data-appearance={modern?"modern":"excel"} data-spreadsheet-formatting>
    {(cellSelected||reserveSpace)&&<div className="ml-input-bar"><span title={label}>{label}</span><div className="min-w-0 flex-1">{formulaBar}</div></div>}
    <div className="ml-format-toolbar"><TripTableFullFormatToolbar {...toolbar} alignment={selectedFormat.alignment??"left"} onSetRowHeight={onSetRowHeight} onSetColumnWidth={onSetColumnWidth} selectedCellCount={count} fontFamily={selectedFontFamily} copied={Boolean(copied)} onCopy={()=>setCopied(currentFormat)} onPaste={()=>{if(copied)toolbar.onApply({...copied});}} onClear={()=>toolbar.onApply({bold:false,italic:false,underline:false,color:"",backgroundColor:"",fontSize:13,fontFamily:"Inter",alignment:null})}/></div>
  </div>;
}
