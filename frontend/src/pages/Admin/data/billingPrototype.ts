/** Phase 1 fixtures and pure calculations. No API, Storage, or financial posting. */
export const BILLING_DATE = "2026-10-23";
export const invoiceStatuses = ["For Billing", "For Review", "Submitted", "Paid", "Overdue", "Cancelled"] as const;
export type InvoiceStatus = typeof invoiceStatuses[number];
export type BillingSection = "invoices" | "unbilled" | "rates" | "collections" | "payables";
export type Customer = {id:string;name:string;address:string;contact:string;email:string;terms:string};
export type Product = {id:string;sku:string;name:string;quantity:number;cbm:number};
export type Stop = {id:string;name:string;address:string;products:Product[]};
export type BillingTruck = {id:string;plate:string;type:string;destination:string;subcontractor:string;stops:Stop[]};
export type BillingTrip = {id:string;dispatch:string;customerId:string;loading:string;delivered:string;origin:string;trucks:BillingTruck[];extra:number;note:string};
export type BillingRate = {id:string;origin:string;destination:string;truckType:string;km:number;tcl:number;subcon:number;remarks:string};
export type InvoiceCharge = {id:string;tripId:string;scope:"Trip"|"Truck"|"Stop";target:string;kind:"Transportation"|"Additional";description:string;amount:number|null};
export type MockInvoice = {id:string;number:string;customerId:string;type:string;tripIds:string[];period:string;invoiceDate:string;dueDate:string;status:InvoiceStatus;preparedBy:string;approvedBy:string;approvedAt:string;notes:string;reviewNote:string;charges:InvoiceCharge[]};
export type MockPayment = {id:string;invoiceId:string;amount:number;date:string;method:string;reference:string;recordedBy:string};
export type MockPayable = {id:string;subcontractor:string;dispatch:string;tripId:string;plate:string;route:string;rate:number;adjustments:number;paid:number;lastPayment:string;reference:string};
export type RateOverrides = Record<string,number>;

export const money = (amount:number) => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(amount);
export const shortDate = (date:string) => date ? new Intl.DateTimeFormat("en-PH",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T00:00:00Z`)) : "—";
export const daysAging = (due:string) => Math.max(0,Math.floor((Date.parse(`${BILLING_DATE}T00:00:00Z`)-Date.parse(`${due}T00:00:00Z`))/86400000));
export const roundMoney = (amount:number) => Math.round((amount+Number.EPSILON)*100)/100;
export const invoiceTotal = (invoice:MockInvoice) => roundMoney(invoice.charges.reduce((sum,line)=>sum+(line.amount??0),0));
export const paidFor = (id:string,payments:MockPayment[]) => roundMoney(payments.filter(payment=>payment.invoiceId===id).reduce((sum,payment)=>sum+payment.amount,0));
export const invoiceBalance = (invoice:MockInvoice,payments:MockPayment[]) => invoice.status==="Cancelled"?0:Math.max(0,roundMoney(invoiceTotal(invoice)-paidFor(invoice.id,payments)));
export const tripCbm = (trip:BillingTrip) => trip.trucks.reduce((sum,truck)=>sum+truck.stops.reduce((total,stop)=>total+stop.products.reduce((cbm,product)=>cbm+product.cbm,0),0),0);
export const matchRate = (rates:BillingRate[],trip:BillingTrip,truck:BillingTruck) => rates.find(rate=>rate.origin.toLowerCase()===trip.origin.toLowerCase()&&rate.destination.toLowerCase()===truck.destination.toLowerCase()&&rate.truckType.toLowerCase()===truck.type.toLowerCase());
export const rateKey = (trip:BillingTrip,truck:BillingTruck) => `${trip.id}:${truck.id}`;
/** Each transportation line represents ONE truck assignment, never a product. */
export function chargesForTrips(trips:BillingTrip[],rates:BillingRate[],overrides:RateOverrides={}):InvoiceCharge[]{
 return trips.flatMap(trip=>[
  ...trip.trucks.map(truck=>({id:`transport:${trip.id}:${truck.id}`,tripId:trip.id,scope:"Truck" as const,target:truck.plate,kind:"Transportation" as const,description:`${trip.origin} → ${truck.destination} · ${truck.type}`,amount:overrides[rateKey(trip,truck)]??matchRate(rates,trip,truck)?.tcl??null})),
  ...(trip.extra?[{id:`coordination:${trip.id}`,tripId:trip.id,scope:"Trip" as const,target:trip.id,kind:"Additional" as const,description:"Dispatch coordination",amount:trip.extra}]:[]),
  ...(trip.id==="TR-261006"?[{id:`waiting:${trip.id}`,tripId:trip.id,scope:"Stop" as const,target:trip.trucks[0].stops[0].name,kind:"Additional" as const,description:"Waiting time · 2 hours",amount:1500}]:[]),
 ]);
}

export const customers:Customer[] = [
 {id:"c1",name:"TCL Consumer Electronics (Sample)",address:"Mindanao Avenue, Quezon City",contact:"Andrea Santos · Billing Coordinator",email:"billing@tcl-sample.example",terms:"30 days"},
 {id:"c2",name:"North Metro Appliance Trading",address:"MacArthur Highway, Valenzuela City",contact:"Michael Cruz · Accounts Payable",email:"accounts@northmetro.example",terms:"30 days"},
 {id:"c3",name:"Luzon Home Retail",address:"EDSA, Caloocan City",contact:"Patricia Reyes · Finance",email:"finance@luzonhome.example",terms:"15 days"},
];
export const sampleRates:BillingRate[] = [
 {id:"r1",origin:"Valenzuela",destination:"Valenzuela",truckType:"10W",km:18,tcl:15000,subcon:9500,remarks:"Metro route · sample approved rate"},
 {id:"r2",origin:"Valenzuela",destination:"Caloocan",truckType:"10W",km:26,tcl:15000,subcon:9500,remarks:"Standard delivery"},
 {id:"r3",origin:"Valenzuela",destination:"Quezon City",truckType:"10W",km:38,tcl:15000,subcon:10000,remarks:"Standard delivery"},
 {id:"r4",origin:"Valenzuela",destination:"Quezon City",truckType:"6W",km:38,tcl:11500,subcon:7500,remarks:"6-wheel closed van"},
 {id:"r5",origin:"Valenzuela",destination:"Pasig",truckType:"10W",km:52,tcl:18000,subcon:12000,remarks:"Toll fees billed separately"},
 {id:"r6",origin:"Valenzuela",destination:"Makati",truckType:"4W",km:45,tcl:8500,subcon:5500,remarks:"Light commercial delivery"},
 {id:"r7",origin:"Valenzuela",destination:"San Fernando",truckType:"10W",km:82,tcl:23000,subcon:16000,remarks:"Provincial route"},
];
const destinations=["Valenzuela","Caloocan","Quezon City","Pasig","Quezon City","Makati","San Fernando"];
const plates=["CBE 6419","CBJ 7183","CBP 4369","NCR 5821","DAA 9032"];
export const sampleTrips:BillingTrip[] = Array.from({length:22},(_,index)=>{
 const n=index+1,id=`TR-2610${String(n).padStart(2,"0")}`,destination=index===20?"Angeles":destinations[index%destinations.length];
 const type=index%7===4?"6W":index%7===5?"4W":"10W";
 return {id,dispatch:`DSP-2610-${String(Math.floor(index/3)+1).padStart(3,"0")}`,customerId:customers[index%3].id,
  loading:`2026-10-${String(Math.min(22,n)).padStart(2,"0")}`,delivered:`2026-10-${String(Math.min(23,n+1)).padStart(2,"0")}`,origin:"Valenzuela",extra:index%4===0?750:0,note:index===20?"No route rate yet; enter a sample manual rate.":index%3===0?"Two truck assignments; transportation billed once per truck.":"Sample completed delivery; eligibility rules pending confirmation.",
  trucks:Array.from({length:index%3===0?2:1},(_,truckIndex)=>({id:`${id}-T${truckIndex+1}`,plate:plates[(index+truckIndex)%plates.length],type,destination,subcontractor:truckIndex?"Reyes Logistics":"JRM Trucking Services",
   stops:Array.from({length:truckIndex===0?2:1},(_,stopIndex)=>({id:`${id}-T${truckIndex+1}-S${stopIndex+1}`,name:`${destination} ${stopIndex?"Warehouse":"Retail Hub"}`,address:`${stopIndex?"Industrial Road":"Main Avenue"}, ${destination}`,
    products:[{id:`p-${index}-${truckIndex}-${stopIndex}-1`,sku:"TCL-TV55",name:'55-inch LED Television',quantity:20+index,cbm:8.4+truckIndex},{id:`p-${index}-${truckIndex}-${stopIndex}-2`,sku:"TCL-REF200",name:"200L Refrigerator",quantity:8+stopIndex,cbm:5.6}]}))})),
 };
});

export function createBillingSample(){
 const specs:Array<{trips:number[];status:InvoiceStatus;date:string;due:string}>=[
  {trips:[0,3],status:"Paid",date:"2026-10-05",due:"2026-11-04"},
  {trips:[1,4],status:"Paid",date:"2026-10-06",due:"2026-11-05"},
  {trips:[2,5],status:"Overdue",date:"2026-10-07",due:"2026-10-22"},
  {trips:[6,9],status:"Submitted",date:"2026-10-11",due:"2026-11-10"},
  {trips:[7],status:"For Review",date:"2026-10-16",due:"2026-11-15"},
  {trips:[8],status:"For Billing",date:"2026-10-18",due:"2026-11-17"},
  {trips:[10],status:"Submitted",date:"2026-10-19",due:"2026-11-18"},
  {trips:[11],status:"Cancelled",date:"2026-10-15",due:"2026-10-30"},
 ];
 const invoices:MockInvoice[]=specs.map((spec,index)=>{
  const trips=spec.trips.map(n=>sampleTrips[n]);
  return {id:`inv-${index+1}`,number:`ALZ-2026-${String(index+101).padStart(4,"0")}`,customerId:trips[0].customerId,type:index%2?"Per Trip":"Consolidated",tripIds:trips.map(trip=>trip.id),period:"October 2026",invoiceDate:spec.date,dueDate:spec.due,status:spec.status,preparedBy:index%2?"Maria Dela Cruz":"Paolo Garcia",approvedBy:["Paid","Submitted","Overdue"].includes(spec.status)?"A. Mendoza":"",approvedAt:["Paid","Submitted","Overdue"].includes(spec.status)?spec.date:"",notes:"Sample transportation charges. Tax and withholding rules are awaiting client confirmation.",reviewNote:"",charges:chargesForTrips(trips,sampleRates)};
 });
 const payments:MockPayment[]=invoices.filter(invoice=>invoice.status==="Paid"||invoice.status==="Overdue"||invoice.id==="inv-4").map((invoice,index)=>({id:`receipt-${index+1}`,invoiceId:invoice.id,amount:invoice.status==="Paid"?invoiceTotal(invoice):10000,date:invoice.status==="Paid"?"2026-10-12":"2026-10-20",method:index%2?"Bank transfer":"Check",reference:`OR-SAMPLE-${1001+index}`,recordedBy:"Maria Dela Cruz"}));
 const payables:MockPayable[]=sampleTrips.slice(0,10).flatMap((trip,index)=>trip.trucks.map((truck,n)=>{
  const rate=matchRate(sampleRates,trip,truck)?.subcon??0;
  return {id:`payable-${index}-${n}`,subcontractor:truck.subcontractor,dispatch:trip.dispatch,tripId:trip.id,plate:truck.plate,route:`${trip.origin} → ${truck.destination}`,rate,adjustments:index===3?500:0,paid:index<3?rate:index===4?3000:0,lastPayment:index<3?"2026-10-18":"",reference:index<3?`PV-SAMPLE-${index+101}`:""};
 }));
 return {invoices,payments,payables,rates:sampleRates.map(rate=>({...rate}))};
}
