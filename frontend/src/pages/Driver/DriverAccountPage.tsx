import {Link} from "react-router-dom";
import {ArrowLeft,Settings,UserRound} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import UserProfilePage from "../Admin/views/UserProfilePage";
import {useAccountPreferences} from "../../components/account/useAccountPreferences";
import SettingsPage from "../Account/SettingsPage";
import '../../components/delivery/delivery-workspace.css';
export default function DriverAccountPage({view}:{view:"profile"|"settings"}){
 const {profile}=useAuth();
 const {preferences,theme}=useAccountPreferences(profile?.id??"anonymous");
 if(!profile)return <p role="status" className="p-4 text-sm text-slate-500">Loading account…</p>;
 return <main className="delivery-account-mobile account-workspace min-h-screen px-3 py-4 sm:px-5" data-account-theme={theme} data-account-density={preferences.compact?"compact":"comfortable"} style={{background:"var(--account-soft)"}}><div className="mx-auto max-w-5xl space-y-3"><nav aria-label="Driver account navigation" className="flex flex-wrap items-center gap-2"><Link to="/trucker/trips" className="account-button"><ArrowLeft className="h-4 w-4"/>My Trips</Link><Link to="/trucker/profile" aria-current={view==="profile"?"page":undefined} className="account-button"><UserRound className="h-4 w-4"/>Profile</Link><Link to="/trucker/settings" aria-current={view==="settings"?"page":undefined} className="account-button"><Settings className="h-4 w-4"/>Settings</Link></nav>{view==="settings"?<SettingsPage key={profile.id}/>:<UserProfilePage key={profile.id} userId={profile.id}/>}</div></main>;
}
