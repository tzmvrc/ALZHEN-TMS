import {AlertTriangle,Camera,ClockAlert,FileText,MapPin,MessageSquare,Package,PackageCheck,PackageMinus,Truck,Undo2,Warehouse,type LucideIcon} from 'lucide-react';
export function milestoneIcon(type:string):LucideIcon{
 if(/BACKLOAD/.test(type))return Undo2;if(/OFFLOAD/.test(type))return PackageMinus;if(/DEMURRAGE/.test(type))return ClockAlert;
 if(/INCIDENT|ACCIDENT|TRAFFIC|BREAKDOWN|FAULT|DELAY/.test(type))return AlertTriangle;
 if(type==='CUSTOM_STATUS')return MessageSquare;
 if(/WAREHOUSE_ARRIVAL/.test(type))return Warehouse;if(/ARRIV/.test(type))return MapPin;if(/POD|PHOTO/.test(type))return Camera;
 if(type==='STOP_DEPARTURE'||/UNLOADING_FINISHED|COMPLETED/.test(type))return PackageCheck;if(/LOAD/.test(type))return Package;if(/REPORT/.test(type))return FileText;return Truck;
}
