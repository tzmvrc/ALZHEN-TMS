// Run INSIDE the worker container only. Synthetic bytes; no Storage/database/provider calls.
const http=require('node:http');
const assert=require('node:assert/strict');
function syntheticPdf(){
 const stream='BT /F1 24 Tf 30 80 Td (ALZHEN SYNTHETIC 2468) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 180] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let data='%PDF-1.7\n';const offsets=[];objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=Buffer.byteLength(data);data+=`xref\n0 5\n0000000000 65535 f \n${offsets.map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(data);
}
function call(path,body=syntheticPdf()){
 return new Promise((resolve,reject)=>{const req=http.request({socketPath:process.env.PDF_WORKER_SOCKET||'/run/pdf/renderer.sock',path,method:'POST',headers:{'Content-Type':'application/pdf'}},res=>{const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>28*1024*1024)res.destroy(Error('Output budget'));else chunks.push(c);});res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));});req.setTimeout(50000,()=>req.destroy(Error('Timeout')));req.on('error',reject);req.end(body);});
}
(async()=>{
 const rendered=await call('/render?pages=10&pixels=24000000');assert.equal(rendered.status,200);assert.equal(JSON.parse(rendered.body).length,1);
 const ocr=await call('/ocr?pages=10&pixels=24000000');assert.equal(ocr.status,200);assert.match(JSON.parse(ocr.body).text,/2468/);
 assert.equal((await call('/render?pages=10&pixels=24000000',Buffer.from('malformed'))).status,400);
 console.log('Synthetic PDF render, offline English Tesseract and malformed-input checks passed. No live data accessed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
