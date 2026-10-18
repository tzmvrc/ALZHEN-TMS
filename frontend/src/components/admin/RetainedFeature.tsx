import {Activity,useState,type ReactNode} from "react";
/** First-visit mounting; hidden Activity preserves state/scroll but pauses effects. */
export default function RetainedFeature({active,children}:{active:boolean;children:ReactNode}){
 const [visited,setVisited]=useState(active);
 if(active&&!visited)setVisited(true);
 return visited||active?<Activity mode={active?"visible":"hidden"}>{children}</Activity>:null;
}
