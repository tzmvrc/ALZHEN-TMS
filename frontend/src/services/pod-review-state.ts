export type PodReviewStatus='PENDING'|'APPROVED'|'REJECTED';
export type PodReviewPage={id:string;kind?:string;pod_review_status?:string|null;pod_review_version?:number|null;delivery_upload_state?:string};
/** Review identity is the delivery event/document, never the stop-wide completion flag. */
export function submissionReviewStatus(pages:PodReviewPage[]):PodReviewStatus|null{
 const receipts=pages.filter(page=>page.kind==='receipt'&&page.delivery_upload_state!=='PENDING');
 if(!receipts.length||receipts.some(page=>!page.pod_review_status))return null;
 if(receipts.some(page=>page.pod_review_status==='REJECTED'))return 'REJECTED';
 return receipts.every(page=>page.pod_review_status==='APPROVED')?'APPROVED':'PENDING';
}
export const podReviewLabel=(status:PodReviewStatus|null)=>status==='APPROVED'?'POD Approved':status==='REJECTED'?'POD Rejected':status==='PENDING'?'POD Pending':'POD review unavailable';
