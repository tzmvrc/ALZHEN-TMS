/** Bound encoded query size as well as item count. Composite spreadsheet IDs can
 * exceed proxy request-line limits long before a 100-item batch is reached. */
export function postgrestBatches(values:readonly string[],maxItems=100,maxEncodedBytes=5000):string[][]{
 const batches:string[][]=[];let batch:string[]=[],size=0;
 for(const value of values){const bytes=encodeURIComponent(JSON.stringify(value)).length+3;
  if(batch.length&&(batch.length>=maxItems||size+bytes>maxEncodedBytes)){batches.push(batch);batch=[];size=0;}
  batch.push(value);size+=bytes;
 }
 if(batch.length)batches.push(batch);
 return batches;
}
