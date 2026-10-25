import {ArrowUpRight,ClipboardList,Database,FileCheck2,LayoutGrid,Phone,Radio,Users} from 'lucide-react';
import {useAuth} from '../../../context/AuthContext';
import {SectionHeading} from './HomePrimitives';

const shortcuts=[
 {id:'combined',title:'Master List',description:'Trips & assignments',Icon:LayoutGrid,tone:'blue'},
 {id:'dispatch-monitoring',title:'Dispatch Monitoring',description:'Delivery progress',Icon:Radio,tone:'green'},
 {id:'dispatch',title:'Dispatch Reports',description:'Cargo & delivery records',Icon:ClipboardList,tone:'blue'},
 {id:'store-calling',title:'Store Calling',description:'Contacts & confirmations',Icon:Phone,tone:'amber'},
 {id:'pod',title:'POD & Documents',description:'Delivery documentation',Icon:FileCheck2,tone:'green'},
 {id:'truckers',title:'Users',description:'Staff & truckers',Icon:Users,tone:'blue'},
 {id:'database',title:'Master Data',description:'Fleet, stores & products',Icon:Database,tone:'amber'},
];
export default function WorkspaceShortcuts({onNavigate}:{onNavigate?:(id:string)=>void}){
 const {profile}=useAuth();
 if(!['ADMIN','STAFF'].includes(profile?.role??''))return null;
 return <section className="home-panel home-workspace-shortcuts" aria-label="Workspace shortcuts"><SectionHeading title="Workspace shortcuts"><LayoutGrid size={18} aria-hidden="true"/></SectionHeading><nav aria-label="Operational workspaces">{shortcuts.map(({id,title,description,Icon,tone})=><button key={id} type="button" data-tone={tone} onClick={()=>onNavigate?.(id)}><Icon className="home-shortcut-watermark" aria-hidden="true"/><span className="home-shortcut-icon"><Icon size={17} aria-hidden="true"/></span><span><strong>{title}</strong><small>{description}</small></span><ArrowUpRight size={14} aria-hidden="true"/></button>)}</nav></section>;
}
