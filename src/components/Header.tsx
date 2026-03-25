import React from 'react';
import { LayoutGrid, Ticket, MapPin, Calendar as CalendarIcon, Users, BarChart3, FileText } from 'lucide-react';
import { NavTab } from './NavTab';
import { UserRole, User, AppConfig } from '../types';
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
  appConfig?: AppConfig;
  isDark?: boolean;
  toggleDark?: () => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  view, setView,
  searchQuery, setSearchQuery,
  currentUser, setCurrentUser,
  handleLogout,
  setShowLogin,
  canViewTickets, canViewMetrics, canViewLogs, canManageUsers, canManageApp, canCreateRequest, canRequestAppChange,
  setShowForm, setShowAppRequestModal, setShowAppRequestSidebar, appConfig, isDark, toggleDark,
}) => {

  return (
    <div style={{background:"var(--bg-surface)",borderBottom:"1px solid var(--border)",padding:"10px 28px",position:"sticky",top:0,zIndex:50}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          {appConfig?.logoUrl ? (
            <img src={appConfig.logoUrl} alt="App logo" style={{width:75,height:75,objectFit:'contain',borderRadius:8}} />
          ) : (
            <div style={{width:36,height:36,background:`linear-gradient(135deg,${appConfig?.primaryColor || '#F59E0B'},${appConfig?.primaryColor || '#D97706'})`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff"}}>T</div>
          )}
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"var(--text-primary)",letterSpacing:-0.3}}>{appConfig?.appName || 'ESFV LRT — TCP Tracker'}</div>
            <div style={{fontSize:10,color:"#94A3B8",fontWeight:500,letterSpacing:0.5}}>{appConfig?.appSubtitle || 'San Fernando Transit Constructors'}</div>
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

          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
          >
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>

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
