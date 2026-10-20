export class FormulaError extends Error { constructor(code) { super(code); this.code=code; } }
const error = (code) => { throw new FormulaError(code); };
export const normalizeAddress = (value) => value.replace(/\$/g, "").toUpperCase();
export function columnLetters(index) { let text=""; for(let n=index+1;n>0;n=Math.floor((n-1)/26))text=String.fromCharCode(65+(n-1)%26)+text; return text; }
export function addressParts(address) { const match=/^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/i.exec(address); if(!match)return error("#REF!"); let column=0; for(const letter of match[2].toUpperCase())column=column*26+letter.charCodeAt(0)-64; return {column:column-1,row:Number(match[4])-1,absoluteColumn:Boolean(match[1]),absoluteRow:Boolean(match[3])}; }
function tokenize(expression) {
 if(expression.length>2000||!expression.startsWith("="))return error("#ERROR!");
 const result=[]; const source=expression.slice(1); let offset=0;
 while(offset<source.length){const tail=source.slice(offset); const blank=/^\s+/.exec(tail);if(blank){offset+=blank[0].length;continue;}
  const match=/^(?:"(?:[^"\r\n]|"")*"|\$?[A-Za-z]+\$?[1-9][0-9]*|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)|[A-Za-z_]+|>=|<=|<>|!=|[+*/(),:><=^-])/.exec(tail);
  if(!match)return error("#ERROR!");const text=match[0];offset+=text.length;
  result.push({text,kind:text.startsWith('"')?"string":/^\$?[A-Za-z]+\$?[1-9]/.test(text)?"reference":/^[0-9.]/.test(text)?"number":/^[A-Za-z_]/.test(text)?"name":"operator"});if(result.length>512)return error("#LIMIT!");
 }
 return result;
}
function parse(expression) {
 const tokens=tokenize(expression);let index=0,depth=0;const take=()=>tokens[index++];const accept=(text)=>tokens[index]?.text===text?(index++,true):false;
 const primary=()=>{if(++depth>64)return error("#LIMIT!");let node;const token=take();if(!token)return error("#ERROR!");
  if(token.kind==="number")node={kind:"literal",value:Number(token.text)};
  else if(token.kind==="string")node={kind:"literal",value:token.text.slice(1,-1).replace(/""/g,'"')};
  else if(token.kind==="reference"){node={kind:"ref",address:normalizeAddress(token.text)};if(accept(":")){const end=take();if(end?.kind!=="reference")return error("#REF!");node={kind:"range",start:normalizeAddress(token.text),end:normalizeAddress(end.text)};}}
  else if(token.text==="(" ){node=compare();if(!accept(")"))return error("#ERROR!");}
  else if(token.text==="+"||token.text==="-")node={kind:"unary",op:token.text,value:primary()};
  else if(token.kind==="name"){const name=token.text.toUpperCase();if(name==="TRUE"||name==="FALSE")node={kind:"literal",value:name==="TRUE"};else{if(!["SUM","AVERAGE","MIN","MAX","COUNT","IF"].includes(name)||!accept("("))return error("#NAME?");const args=[];if(!accept(")")){do{args.push(compare());}while(accept(","));if(!accept(")"))return error("#ERROR!");}node={kind:"call",name,args};}}
  else return error("#ERROR!");depth--;return node;
 };
 const product=()=>{let left=primary();while(["*","/"].includes(tokens[index]?.text??"")){const op=take().text;left={kind:"binary",op,left,right:primary()};}return left;};
 const sum=()=>{let left=product();while(["+","-"].includes(tokens[index]?.text??"")){const op=take().text;left={kind:"binary",op,left,right:product()};}return left;};
 const compare=()=>{let left=sum();while([">","<",">=","<=","=","<>","!="].includes(tokens[index]?.text??"")){const op=take().text;left={kind:"binary",op,left,right:sum()};}return left;};
 const root=compare();if(index!==tokens.length)return error("#ERROR!");return root;
}
export function rangeAddresses(start,end){const a=addressParts(start),b=addressParts(end),result=[];if((Math.abs(a.row-b.row)+1)*(Math.abs(a.column-b.column)+1)>1000)return error("#LIMIT!");for(let row=Math.min(a.row,b.row);row<=Math.max(a.row,b.row);row++)for(let column=Math.min(a.column,b.column);column<=Math.max(a.column,b.column);column++)result.push(`${columnLetters(column)}${row+1}`);return result;}
export function bindFormula(expression,rows,columns,fallback={}) {
 const root=parse(expression);const references={};
 const add=(address)=>{if(fallback[normalizeAddress(address)]){references[normalizeAddress(address)]=fallback[normalizeAddress(address)];return;}const {row,column}=addressParts(address);if(!rows[row]?.id||!columns[column]?.id)return error("#REF!");references[normalizeAddress(address)]={rowId:rows[row].id,columnId:columns[column].id};if(Object.keys(references).length>1000)return error("#LIMIT!");};
 const visit=(node)=>{if(node.kind==="ref")add(node.address);else if(node.kind==="range")rangeAddresses(node.start,node.end).forEach(add);else if(node.kind==="binary"){visit(node.left);visit(node.right);}else if(node.kind==="unary")visit(node.value);else if(node.kind==="call")node.args.forEach(visit);};visit(root);return {expression,references};
}
export function shiftFormula(expression,rowDelta,columnDelta=0) {
 return "="+tokenize(expression).map(token=>{if(token.kind!=="reference")return token.text;const p=addressParts(token.text);const row=p.row+(p.absoluteRow?0:rowDelta),column=p.column+(p.absoluteColumn?0:columnDelta);if(row<0||column<0)return error("#REF!");return `${p.absoluteColumn?"$":""}${columnLetters(column)}${p.absoluteRow?"$":""}${row+1}`;}).join("");
}
export function evaluateFormula(formula,resolve) {
 let budget=10000;const numeric=(value)=>{if(value===null||value===undefined||value==="")return 0;const number=typeof value==="boolean"?Number(value):Number(value);if(!Number.isFinite(number))return error("#VALUE!");return number;};
 const scalar=(node)=>{if(--budget<0)return error("#LIMIT!");switch(node.kind){case"literal":return node.value;case"ref":{const ref=formula.references[node.address];if(!ref)return error("#REF!");return resolve(ref);}case"range":return rangeAddresses(node.start,node.end).map(address=>{const ref=formula.references[address];if(!ref)return error("#REF!");return resolve(ref);});case"unary":return node.op==="-"?-numeric(scalar(node.value)):numeric(scalar(node.value));case"binary":{const left=scalar(node.left),right=scalar(node.right);switch(node.op){case"+":return numeric(left)+numeric(right);case"-":return numeric(left)-numeric(right);case"*":return numeric(left)*numeric(right);case"/":if(numeric(right)===0)return error("#DIV/0!");return numeric(left)/numeric(right);case">":return numeric(left)>numeric(right);case"<":return numeric(left)<numeric(right);case">=":return numeric(left)>=numeric(right);case"<=":return numeric(left)<=numeric(right);case"=":return left===right;default:return left!==right;}}case"call":{if(node.name==="IF"){if(node.args.length!==3)return error("#VALUE!");return scalar(scalar(node.args[0])?node.args[1]:node.args[2]);}const values=node.args.flatMap(arg=>{const value=scalar(arg);return Array.isArray(value)?value:[value];}).filter(value=>value!==null&&value!==undefined&&value!=="");const numbers=values.filter(value=>typeof value==="number"&&Number.isFinite(value));if(node.name==="COUNT")return numbers.length;if(node.name==="SUM")return numbers.reduce((a,b)=>a+b,0);if(!numbers.length)return node.name==="AVERAGE"?error("#DIV/0!"):0;return node.name==="MIN"?Math.min(...numbers):node.name==="MAX"?Math.max(...numbers):numbers.reduce((a,b)=>a+b,0)/numbers.length;}}};
 const result=scalar(parse(formula.expression));if(typeof result==="number"&&!Number.isFinite(result))return error("#VALUE!");return result;
}
export function formulaCellValue(rows,rowId,columnId,stack=new Set()) {
 const key=`${rowId}:${columnId}`;if(stack.has(key)||stack.size>64)return error("#CYCLE!");const row=rows.find(row=>row.id===rowId);if(!row)return error("#REF!");const cell=row.cells.find(cell=>cell.column_id===columnId);if(!cell)return null;if(!cell.formula)return cell.value;const next=new Set(stack).add(key);return evaluateFormula(cell.formula,reference=>formulaCellValue(rows,reference.rowId,reference.columnId,next));
}

/** A render-snapshot cache keyed only by physical IDs, independent of visible order. */
export function createFormulaEvaluator(rows,columns) {
 const rowIds=new Set(rows.map(row=>row.id)),columnIds=columns?new Set(columns.map(column=>column.id)):null;
 const cells=new Map(rows.flatMap(row=>row.cells.map(cell=>[`${row.id}:${cell.column_id}`,cell]))),memo=new Map();
 const read=(rowId,columnId,path=new Set())=>{
  if(!rowIds.has(rowId)||columnIds&&!columnIds.has(columnId))return error("#REF!");const key=`${rowId}:${columnId}`;
  if(path.has(key)||path.size>64)return error("#CYCLE!");const cached=memo.get(key);if(cached?.error)throw cached.error;if(cached)return cached.value;
  const cell=cells.get(key);if(!cell)return null;
  try{const next=new Set(path).add(key),value=cell.formula?evaluateFormula(cell.formula,ref=>read(ref.rowId,ref.columnId,next)):cell.value;memo.set(key,{value});return value;}catch(cause){if(cause instanceof FormulaError)memo.set(key,{error:cause});throw cause;}
 };return read;
}

/** Same physical composite identity on both sides of the API. Never a visible index. */
export function physicalRowIdentity(row) {
 if(row.source_type&&row.source_record_id)return `event:${row.source_type}:${row.source_record_id}`;
 if(row.store_call_id)return `store-call:${row.store_call_id}`;
 if(row.pod_record_id)return `pod:${row.pod_record_id}`;
 const fields=[["trip",row.trip_id??row._trip_id],["stop",row.trip_stop_id??row._trip_stop_id],["line",row.trip_line_item_id??row._trip_line_item_id],["assignment",row.assignment_id??row._assignment_id],["billing",row.billing_id??row._billing_id],["incident",row.incident_id??row._incident_id],["backload",row.backload_id??row._backload_id],["offload",row.offload_id??row._offload_id]];
 return fields.filter(([,id])=>typeof id==="string"&&id).map(([key,id])=>`${key}:${id}`).join(":")||null;
}
export function validateFormulaSyntax(expression){parse(expression);}

/** Fill binds the shifted expression to physical rows; absolute rows remain locked. */
export function shiftBoundFormula(formula,rowDelta,rows,columns){
 const shifted=shiftFormula(formula.expression,rowDelta),fallback={},tokens=tokenize(formula.expression);
 const move=(address,absoluteRow)=>{const old=formula.references[normalizeAddress(address)];if(!old)return error("#REF!");const parts=addressParts(address);let rowId=old.rowId;if(!absoluteRow){const index=rows.findIndex(row=>row?.id===old.rowId);if(index<0||!rows[index+rowDelta]?.id)return error("#REF!");rowId=rows[index+rowDelta].id;}const label=`${columnLetters(parts.column)}${parts.row+(absoluteRow?0:rowDelta)+1}`;fallback[label]={rowId,columnId:old.columnId};};
 for(let index=0;index<tokens.length;index++){
  const token=tokens[index];if(token.kind!=="reference")continue;
  const end=tokens[index+1]?.text===":"?tokens[index+2]:null;
  if(end?.kind==="reference"){
   const startParts=addressParts(token.text),endParts=addressParts(end.text);
   if(startParts.absoluteRow===endParts.absoluteRow)for(const address of rangeAddresses(token.text,end.text))move(address,startParts.absoluteRow);
   else {
    const shiftedStart=shiftFormula(`=${token.text}`,rowDelta).slice(1),shiftedEnd=shiftFormula(`=${end.text}`,rowDelta).slice(1),included=new Set(rangeAddresses(shiftedStart,shiftedEnd));
    for(const address of rangeAddresses(token.text,end.text))if(included.has(address)&&formula.references[address])fallback[address]=formula.references[address];
   }
   index+=2;
  }else move(token.text,addressParts(token.text).absoluteRow);
 }
 return bindFormula(shifted,rows,columns,fallback);
}

export function formulaReferenceAddresses(expression){const addresses=new Set();const visit=node=>{if(node.kind==="ref")addresses.add(node.address);else if(node.kind==="range")rangeAddresses(node.start,node.end).forEach(address=>addresses.add(address));else if(node.kind==="unary")visit(node.value);else if(node.kind==="binary"){visit(node.left);visit(node.right);}else if(node.kind==="call")node.args.forEach(visit);if(addresses.size>1000)return error("#LIMIT!");};visit(parse(expression));return [...addresses];}

/** Preview references in a draft without requiring a complete expression. Never evaluates it. */
export function formulaDraftReferenceAddresses(expression) {
 const tokens=tokenize(expression),addresses=new Set();
 for(let index=0;index<tokens.length;index++){
  const token=tokens[index];if(token.kind!=="reference")continue;
  if(tokens[index+1]?.text===":"&&tokens[index+2]?.kind==="reference"){
   rangeAddresses(token.text,tokens[index+2].text).forEach(address=>addresses.add(address));index+=2;
  }else addresses.add(normalizeAddress(token.text));
  if(addresses.size>1000)return error("#LIMIT!");
 }
 return [...addresses];
}
