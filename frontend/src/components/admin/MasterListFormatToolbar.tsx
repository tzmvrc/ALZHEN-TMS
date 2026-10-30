import {TripTableFullFormatToolbar} from "./TripTableFullFormatToolbar";
import type {MasterListFormatting} from "./useMasterListFormatting";
export default function MasterListFormatToolbar({formatting}:{formatting:MasterListFormatting}){
 return <TripTableFullFormatToolbar selectedCellCount={formatting.design.canEdit?formatting.count:0} selectionLabel={formatting.selectionLabel}
 selectionIsBold={formatting.bold} selectionIsItalic={formatting.italic} selectionIsUnderlined={formatting.underline}
 selectedTextColor={formatting.color} selectedBackgroundColor={formatting.backgroundColor} selectedFontSize={formatting.fontSize}
 alignment={formatting.selected.alignment??"left"} fontFamily={formatting.fontFamily} copied={Boolean(formatting.copied)} onCopy={formatting.copy} onPaste={formatting.paste} onClear={formatting.clear}
 onApply={formatting.apply} saving={formatting.design.saving} feedback={formatting.design.feedback}/>;
}
