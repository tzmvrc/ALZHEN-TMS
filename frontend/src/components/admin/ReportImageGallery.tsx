import DeliveryEvidenceGallery from '../delivery/DeliveryEvidenceGallery';
type ReportImage={id:string;file_name:string;signed_url:string;mime_type?:string|null};
/** All authorized report/evidence links use the same centered viewer. */
export default function ReportImageGallery({images}:{images:readonly ReportImage[]}){
 return <div aria-label="Report images"><DeliveryEvidenceGallery labelPrefix="Preview" files={images.map(image=>({id:image.id,file_name:image.file_name,url:image.signed_url,mime_type:image.mime_type}))}/></div>;
}
