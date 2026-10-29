import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createReceiptOcr} from './pod-ocr.service.js';
import type {VisionPage,VisionExtraction} from './pod-vision.service.js';
/** Temporary inference crops only. Uploaded originals and Storage files are unchanged. */
export async function serialColumnCrops(page:VisionPage){
 const image=await loadImage(page.bytes),ratio=Math.min(1,900/image.width),w=Math.round(image.width*ratio),h=Math.round(image.height*ratio),probe=createCanvas(w,h),ctx=probe.getContext('2d');ctx.drawImage(image,0,0,w,h);
 const pixels=ctx.getImageData(0,0,w,h).data,runs:Array<{from:number;to:number}>=[];let start=-1;
 for(let x=Math.floor(w*.15);x<Math.floor(w*.85);x++){let dark=0,total=0;for(let y=Math.floor(h*.16);y<h*.93;y++){const i=(y*w+x)*4;if(pixels[i]+pixels[i+1]+pixels[i+2]<360)dark++;total++;}if(dark/Math.max(1,total)<.012){if(start<0)start=x;}else if(start>=0){if(x-start>=Math.max(10,w*.025))runs.push({from:start,to:x});start=-1;}}
 const candidates=runs.sort((a,b)=>(b.to-b.from)-(a.to-a.from)).slice(0,3).map(run=>(run.from+run.to)/2).sort((a,b)=>a-b),cuts:number[]=[];
 for(const cut of candidates)if(cut-(cuts.at(-1)??0)>w*.17&&w-cut>w*.17)cuts.push(cut);
 const boxes=cuts.length?[0,...cuts.map(cut=>Math.round(cut/ratio)),image.width].slice(0,-1).map((left,index)=>({left,top:0,width:([0,...cuts.map(cut=>Math.round(cut/ratio)),image.width][index+1])-left,height:image.height})):[{left:0,top:0,width:image.width,height:Math.min(image.height,Math.ceil(image.height/2)+20)},{left:0,top:Math.max(0,Math.floor(image.height/2)-20),width:image.width,height:image.height-Math.max(0,Math.floor(image.height/2)-20)}];
 return boxes.map(box=>{const scale=Math.min(3,2400/Math.max(box.width,box.height)),canvas=createCanvas(Math.max(1,Math.round(box.width*scale)),Math.max(1,Math.round(box.height*scale))),draw=canvas.getContext('2d');draw.imageSmoothingEnabled=false;draw.drawImage(image,box.left,box.top,box.width,box.height,0,0,canvas.width,canvas.height);return {mime:'image/png',bytes:canvas.toBuffer('image/png')};});
}
/** OCR is a secondary exact-string cross-check; it never supplies or repairs serials. */
export async function crossCheckDenseSerials(page:VisionPage,result:VisionExtraction,crops?:VisionPage[]):Promise<VisionExtraction>{
 if((result.serial_groups??[]).reduce((sum,group)=>sum+group.serials.length,0)<20)return result;
 let text='';try{const reader=await createReceiptOcr(AbortSignal.timeout(18000));try{for(const crop of crops??[page])text+='\n'+(await reader.recognize(crop.bytes)).text;}finally{await reader.close();}}catch{/* Unverified serials remain available for manual checking. */}
 const tokens=new Set(text.match(/[A-Za-z0-9._/-]{8,200}/g)??[]);let disagreements=0;
 const groups=(result.serial_groups??[]).map(group=>{const unverified=group.serials.filter(serial=>!tokens.has(serial));disagreements+=unverified.length;return {...group,serials:group.serials.filter(serial=>tokens.has(serial)),uncertain_serials:[...new Set([...group.uncertain_serials,...unverified])]};});
 return {...result,serial_groups:groups,scan_complete:result.scan_complete===true&&disagreements===0,scan_issues:[...(result.scan_issues??[]),...(disagreements?[`${disagreements} serials require manual checking because the independent readings did not agree exactly.`]:[])]};
}
