import {forwardRef,type ComponentPropsWithoutRef} from "react";
import {TripTableCell} from "./TripTableShared";
const TripSheetCell=forwardRef<HTMLTableCellElement,ComponentPropsWithoutRef<"td">>(function TripSheetCell(props,ref){return <TripTableCell {...props} ref={ref}/>;});
export default TripSheetCell;
