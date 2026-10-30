export const tripRowHeightStorageKey="alzhen:master-list:row-height:v1";
export function readTripRowHeight(){const value=Number(localStorage.getItem(tripRowHeightStorageKey));return [44,56,72].includes(value)?value:56;}
