import {memo} from 'react';
import {Truck} from 'lucide-react';
import './road-progress.css';
/** Decorative road motion is independent of the authoritative progress position. */
export default memo(function RoadProgress({percent,label='Delivery progress'}:{percent:number|null;label?:string}){
 const value=percent===null?null:Math.max(0,Math.min(100,percent));
 return <div className="trip-progress-road al-road-progress" role={value===null?'status':'progressbar'} aria-label={label} aria-valuenow={value??undefined} aria-valuemin={value===null?undefined:0} aria-valuemax={value===null?undefined:100}><i style={{transform:`scaleX(${(value??0)/100})`}}/><span className="trip-road-lanes" aria-hidden/>{value!==null&&<span className="trip-progress-truck" style={{left:`${value}%`}} aria-hidden><Truck size={22}/></span>}</div>;
});
