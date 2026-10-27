import {useState} from 'react';
import {Link,useNavigate} from "react-router-dom";
import {ArrowLeft,Settings,UserRound,LogOut} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import UserProfilePage from "../Admin/views/UserProfilePage";
import {useAccountPreferences} from "../../components/account/useAccountPreferences";
import SettingsPage from "../Account/SettingsPage";
import '../../components/delivery/delivery-workspace.css';
export default function DriverAccountPage({view}:{view:"profile"|"settings"}){
 const {profile,logout}=useAuth(),navigate=useNavigate();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const signOut=async()=>{setBusy(true);try{await logout();navigate('/trucker/login',{replace:true});}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const {preferences,theme}=useAccountPreferences(profile?.id??"anonymous");
 if(!profile)return <p role="status" className="p-4 text-sm text-slate-500">Loading account…</p>;
 return <main className="delivery-account-mobile account-workspace min-h-screen px-3 py-4 sm:px-5" data-account-theme={theme} data-account-density={preferences.compact?"compact":"comfortable"} style={{background:"var(--account-soft)"}}><div className="mx-auto max-w-5xl space-y-3"><nav aria-label="Driver account navigation" className="flex flex-wrap items-center gap-2"><Link to="/trucker/trips" className="account-button"><ArrowLeft className="h-4 w-4"/>My Trips</Link><Link to="/trucker/profile" aria-current={view==="profile"?"page":undefined} className="account-button"><UserRound className="h-4 w-4"/>Profile</Link><Link to="/trucker/settings" aria-current={view==="settings"?"page":undefined} className="account-button"><Settings className="h-4 w-4"/>Settings</Link><button type="button" disabled={busy} className="account-button ml-auto" onClick={()=>void signOut()}><LogOut className="h-4 w-4"/>{busy?"Logging out...":"Logout"}</button></nav>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{view==="settings"?<SettingsPage key={profile.id}/>:<UserProfilePage key={profile.id} userId={profile.id}/>}</div></main>;
}
