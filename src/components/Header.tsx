import React from 'react';
import { LayoutGrid, Ticket, MapPin, Calendar as CalendarIcon, Users, BarChart3, FileText } from 'lucide-react';
import { NavTab } from './NavTab';
import { UserRole, User } from '../types';
import { SearchInput } from '../features/search/SearchInput';
import { NewRequestButton } from '../features/actions/NewRequestButton';
import { RequestAppChangeButton } from '../features/actions/RequestAppChangeButton';
import { UserProfile } from '../features/userProfile/UserProfile';

interface HeaderProps {
  view: string;
  setView: (view: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  handleLogout: () => void;
  setShowLogin: (show: boolean) => void;
  canViewTickets: boolean;
  canViewMetrics: boolean;
  canViewLogs: boolean;
  canManageUsers: boolean;
  canManageApp: boolean;
  canCreateRequest: boolean;
  canRequestAppChange: boolean;
  setShowForm: (show: boolean) => void;
  setShowAppRequestModal: (show: boolean) => void;
  setShowAppRequestSidebar: (show: boolean) => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  view, setView,
  searchQuery, setSearchQuery,
  currentUser, setCurrentUser,
  handleLogout,
  setShowLogin,
  canViewTickets, canViewMetrics, canViewLogs, canManageUsers, canManageApp, canCreateRequest, canRequestAppChange,
  setShowForm, setShowAppRequestModal, setShowAppRequestSidebar
}) => {

  return (
    <div style={{background:"#fff",borderBottom:"1px solid #E2E8F0",padding:"16px 28px",position:"sticky",top:0,zIndex:50}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:36,height:36,background:"linear-gradient(135deg,#F59E0B,#D97706)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff"}}>T</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"#0F172A",letterSpacing:-0.3}}>ESFV LRT — TCP Tracker</div>
            <div style={{fontSize:10,color:"#94A3B8",fontWeight:500,letterSpacing:0.5}}>San Fernando Transit Constructors</div>
          </div>
        </div>

        <SearchInput view={view} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-400 font-mono mr-2">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <NavTab active={view === "table"} onClick={() => setView("table")} icon={LayoutGrid} label="Plans" />
            
            {canViewTickets && (
              <NavTab active={view === "plan_requests"} onClick={() => setView("plan_requests")} icon={Ticket} label="Requests" />
            )}

            <NavTab active={view === "locs"} onClick={() => setView("locs")} icon={MapPin} label="LOCs" />
            
            <NavTab active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarIcon} label="Calendar" />
            <NavTab active={view === "community"} onClick={() => setView("community")} icon={Users} label="Community" />

            {canViewMetrics && (
              <NavTab active={view === "metrics"} onClick={() => setView("metrics")} icon={BarChart3} label="Metrics" />
            )}
            {canViewLogs && (
              <NavTab active={view === "log"} onClick={() => setView("log")} icon={FileText} label="System Log" />
            )}
            {canManageUsers && (
              <NavTab active={view === "users"} onClick={() => setView("users")} icon={Users} label="Team" />
            )}
          </div>

          <div style={{width:1, height:24, background:"#E2E8F0", margin:"0 8px"}} />

          <NewRequestButton canCreateRequest={canCreateRequest} onClick={() => setShowForm(true)} />

          <UserProfile 
            currentUser={currentUser} 
            handleLogout={handleLogout} 
            setShowLogin={setShowLogin} 
            setCurrentUser={setCurrentUser} 
          />
        </div>
      </div>
    </div>
  );
};

export const Header = React.memo(HeaderComponent);
