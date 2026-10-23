import {useMemo,useState} from "react";
import {ArrowUpRight,CheckCircle2,Clock3,FileText,Plus,Receipt,RotateCcw,Truck,Upload,Wallet} from "lucide-react";
import {useAuth} from "../../../context/AuthContext";
import {SpreadsheetSheetHeader} from "../../../components/admin/SpreadsheetWorkspace";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import BillingTable,{type BillingColumn} from "../../../components/admin/billing/BillingTable";
import {BillingDialog,BillingStatus,billingButton,billingInput,billingPrimary} from "../../../components/admin/billing/BillingUi";
import InvoiceWorkspace,{type InvoiceAction} from "../../../components/admin/billing/InvoiceWorkspace";
import {CreateInvoiceDialog,InvoiceExportDialog,PaymentDialog,RateEditDialog,RateImportDialog,TripRateDialog} from "../../../components/admin/billing/BillingDialogs";
import {BILLING_DATE,createBillingSample,customers,daysAging,invoiceStatuses,invoiceBalance,invoiceTotal,matchRate,money,paidFor,rateKey,sampleTrips,shortDate,tripCbm,type BillingRate,type BillingSection,type BillingTrip,type MockInvoice,type MockPayable,type MockPayment,type RateOverrides} from "../data/billingPrototype";

const sections:Array<{key:BillingSection;label:string}>=[{key:"invoices",label:"Invoices"},{key:"unbilled",label:"Unbilled Trips"},{key:"rates",label:"Rates"},{key:"collections",label:"Collections"},{key:"payables",label:"Subcon Payables"}];
const customerName=(id:string)=>customers.find(customer=>customer.id===id)?.name??id;
const payableTotal=(row:MockPayable)=>Math.round((row.rate+row.adjustments)*100)/100;
const payableBalance=(row:MockPayable)=>Math.max(0,Math.round((payableTotal(row)-row.paid)*100)/100);
type PaymentEntry=Omit<MockPayment,"invoiceId"|"recordedBy">;
const initialSubconHistory=(rows:MockPayable[])=>Object.fromEntries(rows.map(row=>[row.id,row.paid?[{id:`initial:${row.id}`,amount:row.paid,date:row.lastPayment,method:"Bank transfer",reference:row.reference}]:[]])) as Record<string,PaymentEntry[]>;

/** Entirely local Phase 1 workspace. Production billing services are not imported. */
export default function BillingView(){
 const {profile}=useAuth();
 const canPrepare=profile?.role==="ADMIN"||profile?.role==="STAFF",canApprove=profile?.role==="ADMIN";
 const actor=[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||(canApprove?"Sample Admin":"Sample Staff");
 const [seed]=useState(createBillingSample),[invoices,setInvoices]=useState(seed.invoices),[payments,setPayments]=useState(seed.payments),[payables,setPayables]=useState(seed.payables),[rates,setRates]=useState(seed.rates);
 const [subconHistory,setSubconHistory]=useState(()=>initialSubconHistory(seed.payables));
 const [section,setSection]=useState<BillingSection>("invoices"),[invoiceId,setInvoiceId]=useState<string|null>(null),[filters,setFilters]=useState<Record<string,string>>({}),[selectedTrips,setSelectedTrips]=useState(new Set<string>()),[overrides,setOverrides]=useState<RateOverrides>({});
 const [notice,setNotice]=useState(""),[createOpen,setCreateOpen]=useState(false),[rateTrip,setRateTrip]=useState<BillingTrip|null>(null),[editRate,setEditRate]=useState<BillingRate|null>(null),[importOpen,setImportOpen]=useState(false),[exportId,setExportId]=useState<string|null>(null);
 const [paymentTarget,setPaymentTarget]=useState<{kind:"invoice"|"subcon";id:string}|null>(null),[revisionId,setRevisionId]=useState<string|null>(null),[reviewText,setReviewText]=useState(""),[cancelId,setCancelId]=useState<string|null>(null),[resetOpen,setResetOpen]=useState(false);
 const [rateTab,setRateTab]=useState<"tcl"|"subcon">("tcl");
 const invoice=invoices.find(row=>row.id===invoiceId),exportInvoice=invoices.find(row=>row.id===exportId);
 const paymentInvoice=paymentTarget?.kind==="invoice"?invoices.find(row=>row.id===paymentTarget.id):undefined;
 const paymentPayable=paymentTarget?.kind==="subcon"?payables.find(row=>row.id===paymentTarget.id):undefined;
 const usedTrips=useMemo(()=>new Set(invoices.filter(row=>row.status!=="Cancelled").flatMap(row=>row.tripIds)),[invoices]);
 const unbilled=sampleTrips.filter(trip=>!usedTrips.has(trip.id));
 const issued=invoices.filter(row=>["Submitted","Paid","Overdue"].includes(row.status));
 const collected=issued.reduce((sum,row)=>sum+paidFor(row.id,payments),0),billed=issued.reduce((sum,row)=>sum+invoiceTotal(row),0);
 const overdue=issued.filter(row=>daysAging(row.dueDate)>0).reduce((sum,row)=>sum+invoiceBalance(row,payments),0);
 const pendingApproval=invoices.filter(row=>row.status==="For Review").length;
 const collectionStatus=(row:MockInvoice)=>{const paid=paidFor(row.id,payments);return paid>=invoiceTotal(row)?"Paid":daysAging(row.dueDate)>0?"Overdue":paid>0?"Partial payment":"Unpaid";};
 const missingRate=(trip:BillingTrip)=>trip.trucks.some(truck=>!Object.hasOwn(overrides,rateKey(trip,truck))&&!matchRate(rates,trip,truck));
 const tripRate=(trip:BillingTrip,kind:"tcl"|"subcon")=>trip.trucks.reduce((sum,truck)=>sum+(kind==="tcl"?overrides[rateKey(trip,truck)]??matchRate(rates,trip,truck)?.tcl??0:matchRate(rates,trip,truck)?.subcon??0),0);
 const openSection=(next:BillingSection)=>{setSection(next);setInvoiceId(null);};
 const openInvoice=(row:MockInvoice)=>{setSection("invoices");setInvoiceId(row.id);};
 const setFilter=(value:string)=>setFilters(current=>({...current,[section]:value}));
 const openCreate=()=>{
  if(!canPrepare)return;
  const customersSelected=new Set(unbilled.filter(trip=>selectedTrips.has(trip.id)).map(trip=>trip.customerId));
  if(customersSelected.size>1){setNotice("Select trips for one customer at a time. Customer grouping is a prototype assumption awaiting confirmation.");return;}
  setCreateOpen(true);
 };
 const invoiceAction=(action:InvoiceAction)=>{
  if(!invoice)return;
  if(action==="export"){setExportId(invoice.id);return;}
  if(!canPrepare)return;
  if(action==="submit"&&invoice.status==="For Billing"){
   if(invoice.charges.some(line=>line.amount===null)){setNotice("Enter the missing sample transportation rates before submitting for review.");return;}
   setInvoices(current=>current.map(row=>row.id===invoice.id?{...row,status:"For Review"}:row));setNotice("Sample invoice submitted for admin review.");
  }
  if(action==="approve"&&canApprove&&invoice.status==="For Review"){
   setInvoices(current=>current.map(row=>row.id===invoice.id?{...row,status:daysAging(row.dueDate)>0?"Overdue":"Submitted",approvedBy:actor,approvedAt:BILLING_DATE,reviewNote:""}:row));setNotice("Sample approval recorded. Approved invoices use Submitted (or Overdue if past due) in this prototype; nothing was sent to the customer.");
  }
  if(action==="return"&&canApprove&&invoice.status==="For Review"){setRevisionId(invoice.id);setReviewText("");}
  if(action==="cancel"&&invoice.status!=="Cancelled"&&paidFor(invoice.id,payments)===0)setCancelId(invoice.id);
 };
 const invoiceColumns:BillingColumn<MockInvoice>[]=[
  {key:"number",label:"Invoice No.",value:row=>row.number,render:row=><button type="button" className="whitespace-nowrap font-semibold text-blue-800 underline-offset-2 hover:underline" onClick={event=>{event.stopPropagation();openInvoice(row);}}>{row.number}</button>,minWidth:160},
  {key:"customer",label:"Customer",value:row=>customerName(row.customerId),minWidth:245},
  {key:"type",label:"Invoice Type",value:row=>row.type},
  {key:"trips",label:"No. of Trips",value:row=>row.tripIds.length,numeric:true,minWidth:105},
  {key:"period",label:"Billing Period",value:row=>row.period},
  {key:"date",label:"Invoice Date",value:row=>row.invoiceDate,render:row=>shortDate(row.invoiceDate)},
  {key:"due",label:"Due Date",value:row=>row.dueDate,render:row=>shortDate(row.dueDate)},
  {key:"total",label:"Total Amount",value:invoiceTotal,numeric:true,render:row=>money(invoiceTotal(row))},
  {key:"paid",label:"Paid Amount",value:row=>paidFor(row.id,payments),numeric:true,render:row=>money(paidFor(row.id,payments))},
  {key:"balance",label:"Outstanding Balance",value:row=>row.status==="Cancelled"?0:invoiceBalance(row,payments),numeric:true,minWidth:155,render:row=>row.status==="Cancelled"?"—":money(invoiceBalance(row,payments))},
  {key:"status",label:"Status",value:row=>row.status,render:row=><BillingStatus value={row.status}/>},
  {key:"prepared",label:"Prepared By",value:row=>row.preparedBy,minWidth:150},
  {key:"approved",label:"Approved By",value:row=>row.approvedBy||"Awaiting approval",minWidth:150},
  {key:"actions",label:"Actions",value:row=>row.number,render:row=><button type="button" className="flex items-center gap-1 text-xs font-medium text-blue-800" onClick={event=>{event.stopPropagation();openInvoice(row);}}>Open <ArrowUpRight className="h-3 w-3"/></button>,minWidth:85},
 ];
 const unbilledColumns:BillingColumn<BillingTrip>[]=[
  {key:"dispatch",label:"Dispatch No.",value:row=>row.dispatch,minWidth:155},{key:"trip",label:"Trip No.",value:row=>row.id},
  {key:"loaded",label:"Loading Date",value:row=>row.loading,render:row=>shortDate(row.loading)},{key:"delivered",label:"Delivery Date",value:row=>row.delivered,render:row=>shortDate(row.delivered)},
  {key:"customer",label:"Customer",value:row=>customerName(row.customerId),minWidth:240},{key:"origin",label:"Pickup Location",value:row=>row.origin},{key:"destination",label:"Delivery Location",value:row=>[...new Set(row.trucks.map(truck=>truck.destination))].join(", "),minWidth:160},
  {key:"truck",label:"Truck Type",value:row=>[...new Set(row.trucks.map(truck=>truck.type))].join(", ")},{key:"plate",label:"Plate No.",value:row=>row.trucks.map(truck=>truck.plate).join(", "),minWidth:190},
  {key:"cbm",label:"Total CBM",value:tripCbm,numeric:true,render:row=>tripCbm(row).toFixed(2)},
  {key:"tcl",label:"TCL Rate",value:row=>tripRate(row,"tcl"),numeric:true,render:row=><span>{money(tripRate(row,"tcl"))}{missingRate(row)&&<span className="block text-[10px] text-rose-600">Missing truck rate</span>}</span>},
  {key:"subcon",label:"Subcon Rate",value:row=>tripRate(row,"subcon"),numeric:true,render:row=>row.trucks.some(truck=>!matchRate(rates,row,truck))?"Rate needed":money(tripRate(row,"subcon"))},
  {key:"status",label:"Billing Status",value:row=>missingRate(row)?"Missing rate":"Ready for preview",render:row=><BillingStatus value={missingRate(row)?"Missing rate":"Ready for preview"}/>},
  {key:"actions",label:"Actions",value:row=>row.id,render:row=><button type="button" className="whitespace-nowrap text-xs font-medium text-blue-800" onClick={event=>{event.stopPropagation();setRateTrip(row);}}>Rates & deliveries</button>},
 ];
 const rateColumns:BillingColumn<BillingRate>[]=[
  {key:"origin",label:"Origin",value:row=>row.origin},{key:"destination",label:"Destination",value:row=>row.destination},{key:"truck",label:"Truck Type",value:row=>row.truckType},
  {key:"km",label:"Distance / KM",value:row=>row.km,numeric:true},{key:"tcl",label:"Approved Rate",value:row=>row.tcl,numeric:true,render:row=>money(row.tcl)},
  {key:"subcon",label:"Subcon Rate",value:row=>row.subcon,numeric:true,render:row=>money(row.subcon)},{key:"difference",label:"Rate Difference",value:row=>row.tcl-row.subcon,numeric:true,render:row=><span className={row.tcl>=row.subcon?"text-emerald-700":"text-rose-700"}>{money(row.tcl-row.subcon)}</span>},
  {key:"remarks",label:"Remarks",value:row=>row.remarks,minWidth:260},
 ];
 const collectionColumns:BillingColumn<MockInvoice>[]=[
  invoiceColumns[0],invoiceColumns[1],{key:"total",label:"Invoice Amount",value:invoiceTotal,numeric:true,render:row=>money(invoiceTotal(row))},invoiceColumns[8],
  {key:"balance",label:"Remaining Balance",value:row=>invoiceBalance(row,payments),numeric:true,render:row=>money(invoiceBalance(row,payments))},invoiceColumns[5],invoiceColumns[6],
  {key:"aging",label:"Days Aging",value:row=>collectionStatus(row)==="Paid"?0:daysAging(row.dueDate),numeric:true,render:row=><span className={collectionStatus(row)==="Overdue"?"font-semibold text-rose-700":""}>{collectionStatus(row)==="Paid"?0:daysAging(row.dueDate)}</span>},
  ...(["date","method","reference"] as const).map(key=>({key:`payment-${key}`,label:{date:"Payment Date",method:"Payment Method",reference:"Payment Reference"}[key],value:(row:MockInvoice)=>payments.filter(payment=>payment.invoiceId===row.id).sort((a,b)=>b.date.localeCompare(a.date))[0]?.[key]??"—",minWidth:key==="reference"?180:140})),
  {key:"status",label:"Status",value:collectionStatus,render:row=><BillingStatus value={collectionStatus(row)}/>},
  {key:"actions",label:"Actions",value:row=>row.number,render:row=><button type="button" className="whitespace-nowrap text-xs font-medium text-blue-800" onClick={event=>{event.stopPropagation();setPaymentTarget({kind:"invoice",id:row.id});}}>{collectionStatus(row)==="Paid"?"Payment details":"Record Payment"}</button>,minWidth:140},
 ];
 const payableColumns:BillingColumn<MockPayable>[]=[
  {key:"subcontractor",label:"Subcontractor",value:row=>row.subcontractor,minWidth:200},{key:"dispatch",label:"Dispatch No.",value:row=>row.dispatch,minWidth:150},{key:"trip",label:"Trip No.",value:row=>row.tripId},{key:"truck",label:"Truck / Plate No.",value:row=>row.plate,minWidth:140},{key:"route",label:"Route",value:row=>row.route,minWidth:240},
  {key:"rate",label:"Subcon Rate",value:row=>row.rate,numeric:true,render:row=>money(row.rate)},{key:"adjustments",label:"Adjustments",value:row=>row.adjustments,numeric:true,render:row=>money(row.adjustments)},
  {key:"total",label:"Total Payable",value:payableTotal,numeric:true,render:row=>money(payableTotal(row))},{key:"paid",label:"Amount Paid",value:row=>row.paid,numeric:true,render:row=>money(row.paid)},
  {key:"balance",label:"Remaining Balance",value:payableBalance,numeric:true,render:row=>money(payableBalance(row))},
  {key:"status",label:"Payment Status",value:row=>payableBalance(row)===0?"Paid":row.paid?"Partial payment":"Unpaid",render:row=><BillingStatus value={payableBalance(row)===0?"Paid":row.paid?"Partial payment":"Unpaid"}/>},
  {key:"actions",label:"Actions",value:row=>row.id,render:row=><button type="button" className="whitespace-nowrap text-xs font-medium text-blue-800" onClick={event=>{event.stopPropagation();setPaymentTarget({kind:"subcon",id:row.id});}}>{payableBalance(row)>0?"Record Payment":"Payment details"}</button>,minWidth:140},
 ];
 const summary=[
  {label:"Total Billed",value:money(billed),hint:"Submitted, paid & overdue",icon:FileText,section:"invoices" as const,filter:""},
  {label:"Total Collected",value:money(collected),hint:"Customer payments only",icon:CheckCircle2,section:"collections" as const,filter:""},
  {label:"Outstanding Balance",value:money(Math.max(0,billed-collected)),hint:"Excludes drafts & cancellations",icon:Wallet,section:"collections" as const,filter:""},
  {label:"Overdue Amount",value:money(overdue),hint:`Aged as of ${shortDate(BILLING_DATE)}`,icon:Clock3,section:"collections" as const,filter:"Overdue"},
  {label:"Unbilled Trips",value:String(unbilled.length),hint:"Available for draft preview",icon:Truck,section:"unbilled" as const,filter:""},
  {label:"Pending Admin Approval",value:String(pendingApproval),hint:"Invoices for review",icon:Receipt,section:"invoices" as const,filter:"For Review"},
 ];
 if(!canPrepare)return <p className="p-4 text-sm text-slate-600">Billing is available to Admin and Staff.</p>;
 return <div className="min-w-0 space-y-3 pb-4">
  <SpreadsheetSheetHeader title="Billing" description="Invoice preparation, customer collections and subcontractor payables."><div className="flex items-center gap-2"><span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">Phase 1 · Sample workspace</span><button type="button" className={billingButton} onClick={()=>setResetOpen(true)} title="Reset all local billing samples"><RotateCcw className="h-3.5 w-3.5"/><span className="hidden sm:inline">Reset samples</span></button></div></SpreadsheetSheetHeader>
  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500"><p>Sample data only · Changes stay in this browser session and reset on refresh · No live financial posting</p><p>Snapshot: {shortDate(BILLING_DATE)} · {canApprove?"Admin":"Staff"} view</p></div>
  <div className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-3 xl:grid-cols-6">{summary.map(({label,value,hint,icon:Icon,section:target,filter})=><button key={label} type="button" className="border-b border-r border-slate-100 p-3 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500 xl:border-b-0" onClick={()=>{openSection(target);setFilters(current=>({...current,[target]:filter}));}}><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-slate-500">{label}</span><Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400"/></div><p className={`mt-2 text-sm font-bold tabular-nums leading-none tracking-tight sm:text-base 2xl:text-lg ${label==="Overdue Amount"?"text-rose-700":label==="Total Collected"?"text-emerald-700":"text-[#0b2341]"}`}>{value}</p><p className="mt-2 text-[10px] text-slate-400">{hint}</p></button>)}</div>
  {notice&&<div role="status" className="flex items-start justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"><p>{notice}</p><button type="button" aria-label="Dismiss billing notice" className="shrink-0 underline" onClick={()=>setNotice("")}>Dismiss</button></div>}
  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200"><nav aria-label="Billing sections" className="flex min-w-0 max-w-full gap-1 overflow-x-auto">{sections.map(tab=><button key={tab.key} type="button" aria-current={section===tab.key?"page":undefined} className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition ${section===tab.key?"border-[#2678b9] text-[#0b2341]":"border-transparent text-slate-500 hover:text-slate-800"}`} onClick={()=>openSection(tab.key)}>{tab.label}{tab.key==="unbilled"&&<span className="ml-1.5 rounded bg-slate-100 px-1.5 text-[10px]">{unbilled.length}</span>}</button>)}</nav><div className="flex gap-2 pb-1">{section==="rates"?<button type="button" className={billingPrimary} onClick={()=>setImportOpen(true)}><Upload className="h-3.5 w-3.5"/>CSV Import</button>:section==="invoices"&&!invoice?<button type="button" className={billingPrimary} onClick={()=>{setSelectedTrips(new Set());setCreateOpen(true);}}><Plus className="h-3.5 w-3.5"/>Create Invoice</button>:null}</div></div>
  {section==="invoices"&&(invoice?<InvoiceWorkspace key={invoice.id} invoice={invoice} trips={sampleTrips.filter(trip=>invoice.tripIds.includes(trip.id))} payments={payments} canPrepare={canPrepare} canApprove={canApprove} onBack={()=>setInvoiceId(null)} onSave={next=>{if(!canPrepare||invoice.status!=="For Billing")return;setInvoices(current=>current.map(row=>row.id===next.id?next:row));setNotice("Sample invoice updated locally.");}} onAction={invoiceAction}/>:<BillingTable name="Invoices" rows={invoices.filter(row=>!filters.invoices||row.status===filters.invoices)} columns={invoiceColumns} filter={{label:"Statuses",options:[...invoiceStatuses]}} filterValue={filters.invoices??""} onFilter={setFilter} onOpen={openInvoice}/>)}
  {section==="unbilled"&&<><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Preview trips and rates before preparing an invoice. Final eligibility rules are not applied.</p><button type="button" className={billingPrimary} disabled={!selectedTrips.size} onClick={openCreate}><Plus className="h-3.5 w-3.5"/>Select Trips for Invoice ({selectedTrips.size})</button></div><BillingTable name="Unbilled trips" rows={unbilled.filter(trip=>!filters.unbilled||(filters.unbilled==="Missing rate"?missingRate(trip):!missingRate(trip)))} columns={unbilledColumns} filter={{label:"Rate states",options:["Ready for preview","Missing rate"]}} filterValue={filters.unbilled??""} onFilter={setFilter} selected={selectedTrips} onSelect={setSelectedTrips} onOpen={setRateTrip} caption="Amounts sum the truck assignments, not products. No final billing eligibility gate is applied."/></>}
  {section==="rates"&&<><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex rounded-md border border-slate-200 bg-white p-0.5">{(["tcl","subcon"] as const).map(tab=><button key={tab} type="button" aria-pressed={rateTab===tab} className={`rounded px-3 py-1.5 text-xs ${rateTab===tab?"bg-[#0b2341] font-medium text-white":"text-slate-500"}`} onClick={()=>setRateTab(tab)}>{tab==="tcl"?"TCL Approved Rates":"Subcontractor Rates"}</button>)}</div><p className="text-xs text-slate-500">Matched by origin → destination + truck type · Sample rate book</p></div><BillingTable key={rateTab} name={rateTab==="tcl"?"TCL approved rates":"Subcontractor rates"} rows={rates.filter(row=>!filters.rates||row.truckType===filters.rates)} columns={rateTab==="tcl"?rateColumns:[...rateColumns.slice(0,4),rateColumns[5],rateColumns[4],...rateColumns.slice(6)]} filter={{label:"Truck types",options:[...new Set(rates.map(row=>row.truckType))]}} filterValue={filters.rates??""} onFilter={setFilter} onOpen={setEditRate}/></>}
  {section==="collections"&&<><p className="text-xs text-slate-500">Customer receipts only. Aging counts days past due; payment history is available on each row.</p><BillingTable name="Collections" rows={issued.filter(row=>!filters.collections||collectionStatus(row)===filters.collections)} columns={collectionColumns} filter={{label:"Payment statuses",options:["Paid","Unpaid","Partial payment","Overdue"]}} filterValue={filters.collections??""} onFilter={setFilter} onOpen={row=>setPaymentTarget({kind:"invoice",id:row.id})}/></>}
  {section==="payables"&&<><div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-xs">{[{label:"Total Payables",amount:payables.reduce((sum,row)=>sum+payableTotal(row),0)},{label:"Paid to Subcontractors",amount:payables.reduce((sum,row)=>sum+row.paid,0)},{label:"Remaining Balance",amount:payables.reduce((sum,row)=>sum+payableBalance(row),0)}].map(item=><div key={item.label}><span className="text-slate-500">{item.label}</span><strong className="ml-3 tabular-nums text-[#0b2341]">{money(item.amount)}</strong></div>)}<span className="ml-auto text-[11px] text-slate-400">Separate from customer collections</span></div><BillingTable name="Subcontractor payables" rows={payables.filter(row=>!filters.payables||row.subcontractor===filters.payables)} columns={payableColumns} filter={{label:"Subcontractors",options:[...new Set(payables.map(row=>row.subcontractor))]}} filterValue={filters.payables??""} onFilter={setFilter} onOpen={row=>setPaymentTarget({kind:"subcon",id:row.id})}/></>}
  {createOpen&&<CreateInvoiceDialog trips={unbilled} rates={rates} overrides={overrides} initialSelection={selectedTrips} onClose={()=>setCreateOpen(false)} onCreate={value=>{if(!canPrepare)return;const number=Math.max(100,...invoices.map(row=>Number(row.number.split("-").at(-1))||0))+1;const next:MockInvoice={...value,id:crypto.randomUUID(),number:`ALZ-2026-${String(number).padStart(4,"0")}`,status:"For Billing",preparedBy:actor,approvedBy:"",approvedAt:"",reviewNote:""};setInvoices(current=>[next,...current]);setSelectedTrips(new Set());setCreateOpen(false);setInvoiceId(next.id);setSection("invoices");setNotice("Sample draft created. Nothing was persisted or sent to the customer.");}}/>}
  {rateTrip&&<TripRateDialog key={rateTrip.id} trip={rateTrip} rates={rates} overrides={overrides} canEdit={canPrepare} onClose={()=>setRateTrip(null)} onSave={values=>{if(!canPrepare)return;setOverrides(current=>({...Object.fromEntries(Object.entries(current).filter(([key])=>!key.startsWith(`${rateTrip.id}:`))),...values}));setRateTrip(null);setNotice("Sample trip rates updated. Existing invoices retain their saved charge amounts.");}}/>}
  {editRate&&<RateEditDialog key={editRate.id} rate={editRate} onClose={()=>setEditRate(null)} onSave={next=>{if(!canPrepare)return;setRates(current=>current.map(row=>row.id===next.id?next:row));setEditRate(null);setNotice("Sample rate updated locally. Existing invoice amounts were preserved.");}}/>}
  {importOpen&&<RateImportDialog onClose={()=>setImportOpen(false)} onImport={rows=>{if(!canPrepare)return;const added=rows.filter(row=>!rates.some(rate=>rate.origin.toLowerCase()===row.origin.toLowerCase()&&rate.destination.toLowerCase()===row.destination.toLowerCase()&&rate.truckType.toLowerCase()===row.truckType.toLowerCase()));setRates(current=>[...current,...added.map(row=>({...row,id:crypto.randomUUID()}))]);setImportOpen(false);setNotice(`${added.length} illustrative rate rows added to sample state; ${rows.length-added.length} existing routes kept. No CSV content was read or uploaded.`);}}/>}
  {exportInvoice&&<InvoiceExportDialog invoice={exportInvoice} onClose={()=>setExportId(null)}/>}
  {paymentInvoice&&<PaymentDialog title={`Payment details · ${paymentInvoice.number}`} balance={invoiceBalance(paymentInvoice,payments)} history={payments.filter(payment=>payment.invoiceId===paymentInvoice.id)} minimumDate={paymentInvoice.invoiceDate} onClose={()=>setPaymentTarget(null)} onSave={payment=>{if(!canPrepare)return;const paid=paidFor(paymentInvoice.id,payments)+payment.amount;setPayments(current=>[...current,{...payment,id:crypto.randomUUID(),invoiceId:paymentInvoice.id,recordedBy:actor}]);setInvoices(current=>current.map(row=>row.id===paymentInvoice.id?{...row,status:Math.round(paid*100)>=Math.round(invoiceTotal(row)*100)?"Paid":daysAging(row.dueDate)>0?"Overdue":"Submitted"}:row));setPaymentTarget(null);setNotice("Sample customer payment recorded. Collections and outstanding balances updated locally.");}}/>}
  {paymentPayable&&<PaymentDialog title={`Subcon payment · ${paymentPayable.subcontractor}`} balance={payableBalance(paymentPayable)} history={subconHistory[paymentPayable.id]??[]} onClose={()=>setPaymentTarget(null)} onSave={payment=>{if(!canPrepare)return;setPayables(current=>current.map(row=>row.id===paymentPayable.id?{...row,paid:Math.round((row.paid+payment.amount)*100)/100,lastPayment:payment.date,reference:payment.reference}:row));setSubconHistory(current=>({...current,[paymentPayable.id]:[...(current[paymentPayable.id]??[]),{...payment,id:crypto.randomUUID()}]}));setPaymentTarget(null);setNotice("Sample subcontractor payment recorded separately. Customer collections were unchanged.");}}/>}
  {revisionId&&canApprove&&<BillingDialog title="Return invoice for revision" description="This returns the sample invoice to For Billing. No financial data is posted." onClose={()=>setRevisionId(null)}><form className="space-y-3" onSubmit={event=>{event.preventDefault();if(!canApprove||!reviewText.trim())return;setInvoices(current=>current.map(row=>row.id===revisionId&&row.status==="For Review"?{...row,status:"For Billing",reviewNote:reviewText.trim(),approvedBy:"",approvedAt:""}:row));setRevisionId(null);setNotice("Sample invoice returned to the preparer for revision.");}}><label className="block text-xs text-slate-600">Revision reason<textarea required maxLength={1000} rows={3} className={`${billingInput} mt-1 !h-auto py-2`} value={reviewText} onChange={event=>setReviewText(event.target.value)}/></label><div className="flex justify-end"><button type="submit" className={billingPrimary}>Return for Revision</button></div></form></BillingDialog>}
  <ConfirmDialog open={Boolean(cancelId)} title="Cancel sample invoice?" description="The sample invoice remains visible as Cancelled. Its trips become available for another sample draft. Operational records are unchanged." confirmLabel="Cancel Invoice" cancelLabel="Keep invoice" onCancel={()=>setCancelId(null)} onConfirm={()=>{if(!canPrepare||!cancelId||paidFor(cancelId,payments)>0)return;setInvoices(current=>current.map(row=>row.id===cancelId?{...row,status:"Cancelled"}:row));setCancelId(null);setNotice("Sample invoice cancelled; no operational trips or financial records were changed.");}}/>
  <ConfirmDialog open={resetOpen} title="Reset billing sample data?" description="Local drafts, edits, payments, manual rates and import examples will be replaced with the original sample workspace." confirmLabel="Reset samples" onCancel={()=>setResetOpen(false)} onConfirm={()=>{const next=createBillingSample();setInvoices(next.invoices);setPayments(next.payments);setPayables(next.payables);setSubconHistory(initialSubconHistory(next.payables));setRates(next.rates);setOverrides({});setSelectedTrips(new Set());setFilters({});setInvoiceId(null);setResetOpen(false);setNotice("Billing sample data reset.");}}/>
 </div>;
}
