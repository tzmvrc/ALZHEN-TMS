export function syntheticPdf(count=2){
 const objects=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Count ${count} /Kids [${Array.from({length:count},(_,i)=>`${3+i*2} 0 R`).join(" ")}] >>`];
 for(let i=0;i<count;i++){
  const stream=`BT /F1 12 Tf 20 60 Td (SYNTHETIC DR 333 PAGE ${i+1}) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${4+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 let data="%PDF-1.7\n";const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=Buffer.byteLength(data);data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(data);
}
