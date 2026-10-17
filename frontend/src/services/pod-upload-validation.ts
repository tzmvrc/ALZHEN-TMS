export const POD_DOCUMENT_LIMIT=5*1024*1024;
/** Client feedback only; backend validates actual bytes/authorization. PDF stays
 * disabled unless an approved capability AND renderer path are available. */
export function validatePodUpload(file:Pick<File,"name"|"size"|"type">,pdfEnabled=false){
 if(!file.name.trim()||file.name.length>255||/[\0\r\n]/.test(file.name))throw new Error("Choose a valid receipt filename.");
 if(file.size<=0||file.size>POD_DOCUMENT_LIMIT)throw new Error("Choose a receipt up to 5 MB.");
 if(file.type==="application/pdf"){
  if(!pdfEnabled)throw new Error("PDF receipts are not activated yet. Choose JPEG, PNG or WebP.");
 }else if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Choose a JPEG, PNG or WebP receipt.");
}
