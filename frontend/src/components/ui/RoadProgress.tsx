import {memo} from 'react';
import {Truck} from 'lucide-react';
import './road-progress.css';
/** Decorative road motion is independent of the authoritative progress position. */
export default memo(function RoadProgress({percent,label='Delivery progress'}:{percent:number;label?:string}){
 const value=Math.max(0,Math.min(100,percent));
 return <div className="trip-progress-road al-road-progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{transform:`scaleX(${value/100})`}}/><span className="trip-road-lanes" aria-hidden/><span className="trip-progress-truck" style={{left:`${value}%`}} aria-hidden><Truck size={22}/></span></div>;
});
