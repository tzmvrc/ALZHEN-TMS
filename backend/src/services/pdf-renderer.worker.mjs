import {createCanvas,DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
import {fileURLToPath} from 'node:url';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
globalThis.fetch=async()=>{throw Error('External resources disabled');};
console.log=()=>{};console.warn=()=>{};
const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
let task;
try{
 const maxPages=Number(process.argv[2]),maxPixels=Number(process.argv[3]);
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>10||!Number.isSafeInteger(maxPixels)||maxPixels<1||maxPixels>24000000)throw Error('Invalid limits');
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){size+=chunk.length;if(size>5242880)throw Error('PDF size');chunks.push(chunk);}
 task=getDocument({data:new Uint8Array(Buffer.concat(chunks)),standardFontDataUrl:fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/',import.meta.url)).replaceAll('\\','/'),isEvalSupported:false,useWorkerFetch:false,maxImageSize:maxPixels,canvasMaxAreaInBytes:96000000,
  disableFontFace:true,useSystemFonts:false,disableAutoFetch:true,stopAtErrors:true,isImageDecoderSupported:false,verbosity:0});
 const doc=await task.promise;
 if(doc.numPages<1||doc.numPages>maxPages||await doc.hasJSActions()||await doc.getAttachments())throw Error('Unsupported PDF');
 const pages=[];let pixels=0,bytes=0;
 for(let i=1;i<=doc.numPages;i++){
  const page=await doc.getPage(i),base=page.getViewport({scale:1});
  if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0)throw Error('Invalid page');
  const view=page.getViewport({scale:Math.min(2,2200/Math.max(base.width,base.height))});
  const width=Math.ceil(view.width),height=Math.ceil(view.height);pixels+=width*height;if(pixels>maxPixels)throw Error('Pixel limit');
  const canvas=createCanvas(width,height);
  try{
   await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport:view}).promise;
   const raster=canvas.toBuffer('image/png');bytes+=raster.length;if(bytes>20971520)throw Error('Raster limit');
   pages.push({bytes:raster.toString('base64'),width,height,mime:'image/png'});
  }finally{canvas.width=0;canvas.height=0;page.cleanup();}
 }
 process.stdout.write(JSON.stringify(pages));
}catch{process.exitCode=1;}
finally{await task?.destroy().catch(()=>{});}
