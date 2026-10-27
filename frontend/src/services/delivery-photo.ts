/** Prepared Files are persisted in IndexedDB; only Storage references go to the API. */
export async function prepareDeliveryPhoto(file:File,document=false,highQuality=false):Promise<File>{
 if(file.type==='application/pdf'){if(file.size>5*1024*1024)throw Error('Choose a PDF smaller than 5 MB.');return file;}
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP photo.');
 if(file.size>30*1024*1024)throw Error('Choose a photo smaller than 30 MB.');
 let bitmap:ImageBitmap|undefined,url:string|undefined;
 try{
  let source:CanvasImageSource,width:number,height:number;
  if(typeof createImageBitmap==='function'){bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});source=bitmap;width=bitmap.width;height=bitmap.height;}
  else{url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();source=img;width=img.naturalWidth;height=img.naturalHeight;}
  if(!width||!height)throw Error('Photo could not be decoded. Choose another image.');
  const maximum=highQuality?2560:1920,ratio=Math.min(1,maximum/Math.max(width,height));
  if(ratio===1&&file.size<=5*1024*1024)return file; // Never degrade a small readable original.
  const canvas=documentCanvas(Math.round(width*ratio),Math.round(height*ratio));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo preparation is unavailable in this browser.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const encode=(quality:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Photo could not be prepared.')),'image/jpeg',quality));
  let blob=await encode(highQuality ? .95 : document ? .9 : .84);
  // Avoid unnecessarily aggressive document encoding when the output is very small.
  if(document&&blob.size<canvas.width*canvas.height*.08)blob=await encode(.96);
  if(blob.size>5*1024*1024){if(file.size<=5*1024*1024)return file;throw Error('Prepared photo exceeds 5 MB. Crop the document or choose a smaller image.');}
  if(file.size<blob.size&&file.size<=5*1024*1024)return file;
  return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
 }catch(error){if(file.size<=5*1024*1024)return file;throw error;}finally{bitmap?.close();if(url)URL.revokeObjectURL(url);}
}
const documentCanvas=(width:number,height:number)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;};
