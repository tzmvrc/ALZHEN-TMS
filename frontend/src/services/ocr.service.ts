/* Browser-side OCR for delivery receipts. tesseract.js is loaded on demand so it
   never ships in the main bundle, and a worker only lives for one scan. */

export type OcrResult = { text: string; confidence: number };

const MAX_SIDE = 2200;

/* Phone photos of receipts are shadowy and often huge. Scaling to a sane size and
   boosting grayscale contrast noticeably improves recognition. */
async function prepareImage(source: Blob): Promise<Blob> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(source);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return source;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = image;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      data[i] = data[i + 1] = data[i + 2] = boosted;
    }
    context.putImageData(image, 0, 0);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob ?? source), "image/png"),
    );
  } catch {
    return source;
  } finally {
    bitmap?.close();
  }
}

export async function recognizeReceipt(
  source: Blob | Blob[],
  onProgress?: (fraction: number) => void,
): Promise<OcrResult> {
  const pages=Array.isArray(source)?source:[source];
  if(!pages.length||pages.length>10)throw Error("Choose a receipt with at most 10 pages.");
  const {createWorker}=await import("tesseract.js");
  let completed=0;
  const worker = await createWorker("eng", 1, {
    logger: (message: { status: string; progress: number }) => {
      if (message.status === "recognizing text") onProgress?.((completed+message.progress)/pages.length);
    },
  });
  try {
    const results:OcrResult[]=[];
    for(const page of pages){const {data}=await worker.recognize(await prepareImage(page));results.push({text:data.text.trim(),confidence:data.confidence});completed++;}
    return {text:results.map(r=>r.text).join("\n\n").slice(0,100000),confidence:Math.round(results.reduce((sum,r)=>sum+r.confidence,0)/results.length)};
  } finally {
    await worker.terminate();
  }
}
