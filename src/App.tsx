/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { updatePlanStage, handleClearPlans, bulkUpdate, handleBulkLOCUpload } from './services/planService';
import { ImportWizard } from './components/ImportWizard';
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import * as XLSX from 'xlsx';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { db, auth, loginWithGoogle, logout, storage, handleFirestoreError, OperationType } from './firebase';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  LayoutGrid, 
  Ticket, 
  MapPin, 
  Calendar as CalendarIcon, 
  ChevronDown, 
  BarChart3, 
  FileText, 
  Users, 
  Settings, 
  AppWindow,
  Activity
} from 'lucide-react';
import { UserManagementView } from './views/UserManagementView';
import { SummaryStatsBar } from './components/SummaryStatsBar';
import { PermissionToggle } from './permissions/PermissionToggle';
import { PermissionProvider } from './permissions/PermissionContext';
import { usePermissions } from './hooks/usePermissions';
import { NavTab } from './components/NavTab';
import { MetricChart } from './components/MetricChart';
import { Spinner } from './components/Spinner';
import { Header } from './components/Header';
import { AdminToolbar } from './components/AdminToolbar';
import { NewRequestModal } from './components/NewRequestModal';
import { LOCFormModal } from './components/modals/LOCFormModal';
import { LoginModal } from './components/modals/LoginModal';
import { useAppRequests } from './features/appRequests/useAppRequests';
import { MetricsView } from './views/MetricsView';
import { SettingsView } from './views/SettingsView';
import { CalendarView } from './views/CalendarView';
import { TableView } from './views/TableView';
import { GlobalActivityLogView } from './views/GlobalActivityLogView';
import { CommunityRelationsView } from './views/CommunityRelationsView';
import { TicketsView } from './views/TicketsView';
import { LocManagerPortalView } from './views/LocManagerPortalView';
import { generateDefaultLogo } from './utils/logo';
import { daysBetween, getCycleTime, getStageDurations, daysFromToday, formatFileSize, calcMetrics } from './utils/plans';
import { TodoSidebar } from './components/TodoSidebar';
import { AppRequestSidebar } from './features/appRequests/AppRequestSidebar';
import { ToastContainer } from './components/ToastContainer';
import { showToast } from './lib/toast';
import { UserRole, User, ReportTemplate, Plan } from './types';
import { 
  STAGES, PLAN_TYPES, SCOPES, SEGMENTS, PRIORITIES, LEADS, STREET_NAMES, 
  FONT as font, MONO_FONT as monoFont,
  IMPORT_TARGET_FIELDS, DEFAULT_MAIN_COLUMNS, DEFAULT_TEAM_COLUMNS, 
  DEFAULT_COMMUNITY_COLUMNS, DEFAULT_LOC_COLUMNS, DEFAULT_LOG_COLUMNS,
  MOT_FIELDS, IMPACT_FIELDS, IMPACT_SECTION_KEYS,
  COMPLETED_STAGES, AT_DOT_STAGES
} from './constants';

import { useMasterFileImport } from './hooks/useMasterFileImport';
import { usePlanForm } from './hooks/usePlanForm';
import { PlanCard } from './components/PlanCard';
import { AppProvider } from './context/AppProvider';
import { useApp } from './hooks/useApp';
import { useDarkMode } from './hooks/useDarkMode';

const TODAY = new Date();
const getLocalDateString = () => new Date().toLocaleDateString('en-CA');
const td = getLocalDateString();

const DEFAULT_LOGO = generateDefaultLogo();

const inp: React.CSSProperties = { background: "var(--bg-surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: font, width: "100%", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4, display: "block" };

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

function AppContent() {
  const [statusDate, setStatusDate] = useState(getLocalDateString());
  
  const { uiState, planManagement, tableState, auth, firestoreData, permissions, planActions, userManagement, locManagement } = useApp();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const { 
    view, setView,
    showAdminMenu, setShowAdminMenu,
    showForm, setShowForm,
    showAppRequestModal, setShowAppRequestModal,
    showAppRequestSidebar, setShowAppRequestSidebar,
    showNeedByWarningModal, setShowNeedByWarningModal,
    warningMessage, setWarningMessage,
    showTodoSidebar, setShowTodoSidebar,
    todoCompletedExpanded, setTodoCompletedExpanded,
    hoveredPlanId, setHoveredPlanId,
    hoveredMetricIndex, setHoveredMetricIndex,
    previewImage, setPreviewImage,
    deletingRequestId, setDeletingRequestId,
    isPermissionEditingMode, setIsPermissionEditingMode,
    showUserForm, setShowUserForm,
    showLOCForm, setShowLOCForm,
    submissionSuccess, setSubmissionSuccess,
    clearLogConfirm, setClearLogConfirm,
    clearPlansConfirm, setClearPlansConfirm,
    loading, setLoading
  } = uiState;
  const {
    selectedPlan, setSelectedPlan,
    draftPlan, setDraftPlan,
    isDirty, setIsDirty,
    minimizedOutreachPlans, setMinimizedOutreachPlans,
    activeImpactFilter, setActiveImpactFilter,
    filter, setFilter,
    sortConfig, setSortConfig,
    planSearch, setPlanSearch,
    selectedPlanIds, setSelectedPlanIds
  } = planManagement;
  const {
    mainCols, setMainCols,
    teamCols, setTeamCols,
    communityCols, setCommunityCols,
    locCols, setLocCols,
    logCols, setLogCols,
    locSortConfig, setLocSortConfig,
    communitySortConfig, setCommunitySortConfig,
    teamSortConfig, setTeamSortConfig,
    searchQuery, setSearchQuery
  } = tableState;
  const { currentUser, setCurrentUser, isRealAdmin, loaded, showLogin, setShowLogin, role, canManageApp } = auth;
  const {
    appRequestForm, setAppRequestForm,
    handleAppRequestFileUpload,
    submitAppRequest
  } = useAppRequests(currentUser, loading, setLoading, showAppRequestModal, setShowAppRequestModal);
  const [newTodoText, setNewTodoText] = useState("");
  const [appRequestTab, setAppRequestTab] = useState<"pending" | "completed">("pending");

  const { plans, setPlans, locs, setLocs, users, setUsers, appRequests, setAppRequests, appTodos, setAppTodos, reportTemplate, setReportTemplate, appConfig, setAppConfig } = firestoreData;
  const { fieldPermissions, setFieldPermissions, toggleSectionPermission } = permissions;

  const getUserLabel = () => {
    if (!currentUser) return "Guest";
    return `${currentUser.name} (${currentUser.role})`;
  };

  const {
    updateStage,
    handleDOTCommentsRec,
    pushTicket,
    addLogEntry,
    deleteLogEntry,
    handleClearLog,
    handleClearPlans,
    updatePlanField,
    discardDraft,
    handleClosePlanCard,
    saveDraft,
    updateLogEntry,
    uploadTCPRevision,
    linkNewLOC
  } = planActions;

  const {
    editingUser, setEditingUser,
    userForm, setUserForm,
    handleSaveUser
  } = userManagement;
  const {
    selectedLOC, setSelectedLOC,
    locForm, setLocForm,
    showBulkLOCModal, setShowBulkLOCModal,
    bulkLOCFile, setBulkLOCFile,
    bulkLOCProgress, setBulkLOCProgress,
    handleBulkLOCUpload: handleBulkLOCUploadService
  } = locManagement;
  const [logEntryForm, setLogEntryForm] = useState<{ text: string, attachments: File[] }>({ text: "", attachments: [] });
  const {
    form, setForm,
    handleSubmit: handlePlanSubmit,
    resetForm
  } = usePlanForm(plans, td, getUserLabel, setShowForm, setSubmissionSuccess, setLoading, currentUser);

  const {
    showImportWizard,
    setShowImportWizard,
    wizardStep,
    setWizardStep,
    handleMasterUpload,
    handleProceedToValidation,
    handleProceedToReview,
    confirmImport,
    resetImport,
    mappingHeaders,
    mappingData,
    columnMapping,
    setColumnMapping,
    importRows,
    updateImportRow,
  } = useMasterFileImport(plans, role, td, getUserLabel, setLoading);


  const motAllAnswered = MOT_FIELDS.every(f => form[f.key] !== null && form[f.key] !== undefined);

  const handleLogin = useCallback(async () => {
    await loginWithGoogle();
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setView("table");
  }, [setView]);

  const deleteUser = async (email: string, userRole: string) => {
    if (email.toLowerCase() === currentUser?.email.toLowerCase()) { showToast("Cannot delete yourself", "error"); return; }

    // Security check: only admins can delete other admins
    if (userRole === UserRole.ADMIN && role !== UserRole.ADMIN) {
      showToast("Only system admins can delete other Tier 0: System Admin members.", "error");
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'users_public', email.toLowerCase()));
      await deleteDoc(doc(db, 'users_private', email.toLowerCase()));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users_public/${email.toLowerCase()}`);
    }
  };

  const handleSendInvite = (email: string, role: string) => {
    const subject = encodeURIComponent("Invitation to join SFTC Traffic Control Portal");
    const body = encodeURIComponent(`Hello,\n\nYou have been invited to join the SFTC Traffic Control Portal as a ${role}.\n\nPlease sign in using your Google account at:\n${window.location.origin}\n\nThanks,\nSFTC MOT Team`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleSubmit = useCallback(() => handlePlanSubmit(motAllAnswered), [handlePlanSubmit, motAllAnswered]);

  const handleBulkUpdate = useCallback(async (updates: Partial<Plan>, date: string | null) => {
    await bulkUpdate(selectedPlanIds, plans, updates, date, currentUser, UserRole, setLoading, setSelectedPlanIds, getUserLabel, td);
  }, [selectedPlanIds, plans, currentUser, setLoading, setSelectedPlanIds, getUserLabel]);

  const handleBulkLOCUpload = useCallback(() => handleBulkLOCUploadService(), [handleBulkLOCUploadService]);

  const stageLabelMap = useMemo(() => new Map(STAGES.map(s => [s.key, s.label])), []);

  const filtered = useMemo(() => plans.filter(p => {
    if(filter.stage!=="all"&&p.stage!==filter.stage) return false;
    if(filter.type!=="all"&&p.type!==filter.type) return false;
    if(filter.lead!=="all"&&p.lead!==filter.lead) return false;
    if(filter.priority!=="all"&&p.priority!==filter.priority) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const stageLabel = stageLabelMap.get(p.stage) || p.stage;
      const match =
        (p.loc != null && String(p.loc).toLowerCase().includes(q)) ||
        (p.type != null && String(p.type).toLowerCase().includes(q)) ||
        (p.scope != null && String(p.scope).toLowerCase().includes(q)) ||
        (p.segment != null && String(p.segment).toLowerCase().includes(q)) ||
        (p.street1 != null && String(p.street1).toLowerCase().includes(q)) ||
        (p.street2 != null && String(p.street2).toLowerCase().includes(q)) ||
        (p.lead != null && String(p.lead).toLowerCase().includes(q)) ||
        (p.priority != null && String(p.priority).toLowerCase().includes(q)) ||
        (p.notes != null && String(p.notes).toLowerCase().includes(q)) ||
        (stageLabel != null && String(stageLabel).toLowerCase().includes(q)) ||
        (p.id != null && String(p.id).toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  }), [plans, filter, searchQuery, stageLabelMap]);

  const toggleSelectAll = useCallback(() => {
    if (selectedPlanIds.length === filtered.length) {
      setSelectedPlanIds([]);
    } else {
      setSelectedPlanIds(filtered.map(p => p.id));
    }
  }, [selectedPlanIds, filtered, setSelectedPlanIds]);

  const toggleSelectPlan = useCallback((id: string) => {
    setSelectedPlanIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, [setSelectedPlanIds]);

  const PRIORITY_MAP = useMemo<Record<string, number>>(() => ({ "Critical": 4, "High": 3, "Medium": 2, "Low": 1 }), []);
  const SORT_KEY_MAP = useMemo<Record<string, string>>(() => ({
    "Plan #": "id", "LOC #": "loc", "Type": "type", "Scope": "scope",
    "Seg": "segment", "Location": "street1", "Lead": "lead", "Priority": "priority",
    "Status": "stage", "Submitted": "submitDate", "Need By": "needByDate", "Wait": "wait"
  }), []);

  const sortedData = useMemo(() => [...filtered].sort((a, b) => {
    if (!sortConfig) {
      const isACompleted = COMPLETED_STAGES.includes(a.stage);
      const isBCompleted = COMPLETED_STAGES.includes(b.stage);
      if (isACompleted !== isBCompleted) return isACompleted ? 1 : -1;

      const aPrio = PRIORITY_MAP[a.priority] || 0;
      const bPrio = PRIORITY_MAP[b.priority] || 0;
      if (aPrio !== bPrio) return bPrio - aPrio;

      const aDate = a.needByDate ? new Date(a.needByDate).getTime() : Infinity;
      const bDate = b.needByDate ? new Date(b.needByDate).getTime() : Infinity;
      return aDate - bDate;
    }
    const { key, direction } = sortConfig;
    const dataKey = SORT_KEY_MAP[key] || key;
    let aValue: any;
    let bValue: any;

    if (key === "Wait") {
      aValue = a.submitDate && !COMPLETED_STAGES.includes(a.stage) ? daysBetween(a.submitDate, td) : a.submitDate && a.approvedDate ? daysBetween(a.submitDate, a.approvedDate) : -1;
      bValue = b.submitDate && !COMPLETED_STAGES.includes(b.stage) ? daysBetween(b.submitDate, td) : b.submitDate && b.approvedDate ? daysBetween(b.submitDate, b.approvedDate) : -1;
    } else if (key === "Priority") {
      aValue = PRIORITY_MAP[a.priority] || 0;
      bValue = PRIORITY_MAP[b.priority] || 0;
    } else if (key === "LOC #") {
      aValue = parseInt(a.loc) || 0;
      bValue = parseInt(b.loc) || 0;
    } else {
      aValue = a[dataKey] || "";
      bValue = b[dataKey] || "";
    }

    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  }), [filtered, sortConfig, td, PRIORITY_MAP, SORT_KEY_MAP]);

  const metrics = useMemo(() => calcMetrics(filtered.filter(p => !p.isHistorical), LEADS, td, TODAY), [filtered, td]);

  const requestLocSort = useCallback((key: string) => {
    setLocSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, [setLocSortConfig]);

  const requestTeamSort = useCallback((key: string) => {
    setTeamSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, [setTeamSortConfig]);

  const sortedTeam = useMemo(() => [...users].sort((a,b) => {
    if (!teamSortConfig) return 0;
    const { key, direction } = teamSortConfig;
    let aValue: any = a[key as keyof User] || "";
    let bValue: any = b[key as keyof User] || "";

    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  }), [users, teamSortConfig]);
  const requestCommunitySort = useCallback((key: string) => {
    setCommunitySortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, [setCommunitySortConfig]);

  const sortedCommunity = useMemo(() => plans
    .filter(p => (p.impact_driveway || p.impact_busStop || p.impact_fullClosure || p.impact_transit) && (!activeImpactFilter || p[activeImpactFilter]))
    .sort((a,b) => {
      if (!communitySortConfig) return 0;
      const { key, direction } = communitySortConfig;
      let aValue: any = a[key] || "";
      let bValue: any = b[key] || "";

      if (key === "id") {
        aValue = a.id;
        bValue = b.id;
      } else if (key === "street") {
        aValue = a.street1;
        bValue = b.street1;
      } else if (key === "status") {
        aValue = a.outreach?.status || "Not Started";
        bValue = b.outreach?.status || "Not Started";
      }

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    }), [plans, activeImpactFilter, communitySortConfig]);

  const sortedLocs = useMemo(() => {
    // Pre-compute end date timestamps to avoid repeated Date parsing during sort
    const locsWithTime = locs.map(l => ({ ...l, _endTime: l.endDate ? new Date(l.endDate).getTime() : 0 }));
    return locsWithTime.filter(l => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return l.locNumber.toLowerCase().includes(q) ||
             l.planIds.some((pid: string) => pid.toLowerCase().includes(q));
    }).sort((a, b) => {
      if (!locSortConfig) return b.uploadedAt.localeCompare(a.uploadedAt);
      const { key, direction } = locSortConfig;
      let aValue: any = a[key as keyof typeof a] || "";
      let bValue: any = b[key as keyof typeof b] || "";

      if (key === "loc") {
        aValue = parseInt(a.locNumber) || 0;
        bValue = parseInt(b.locNumber) || 0;
      } else if (key === "rev") {
        aValue = a.revision || 0;
        bValue = b.revision || 0;
      } else if (key === "validity") {
        aValue = a._endTime;
        bValue = b._endTime;
      } else if (key === "plans") {
        aValue = a.planIds.length;
        bValue = b.planIds.length;
      }

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [locs, searchQuery, locSortConfig]);
  const requestSort = useCallback((key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, [setSortConfig]);

  const exportToCSV = useCallback(() => {
    setLoading(prev => ({ ...prev, export: true }));

    setTimeout(() => {
      const headers = ["Plan #", "Rev", "LOC #", "Type", "Scope", "Seg", "Location", "Lead", "Priority", "Status", "Submitted", "Need By", "Wait"];
      const rows = sortedData.map(plan => {
        const stage = stageLabelMap.get(plan.stage) || plan.stage;
        const wd = plan.submitDate && !COMPLETED_STAGES.includes(plan.stage)
          ? daysBetween(plan.submitDate, td)
          : plan.submitDate && plan.approvedDate
            ? daysBetween(plan.submitDate, plan.approvedDate)
            : null;
        const waitStr = COMPLETED_STAGES.includes(plan.stage) ? "Approved" : wd !== null ? `${wd}d` : "—";

        return [
          plan.id,
          plan.rev || 0,
          plan.loc || "TBD",
          plan.type,
          plan.scope,
          plan.segment,
          `${plan.street1}${plan.street2 ? ` / ${plan.street2}` : ""}`,
          plan.lead,
          plan.priority,
          stage,
          plan.submitDate || "—",
          plan.needByDate || "—",
          waitStr
        ];
      });

      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `ESFV_LRT_Plans_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setLoading(prev => ({ ...prev, export: false }));
    }, 1000);
  }, [sortedData, stageLabelMap, td, setLoading]);

  const submitLOC = async () => {
    if (!locForm.locNumber || !locForm.startDate || !locForm.endDate) {
      showToast("Please fill in all required fields.", "warning");
      return;
    }

    setLoading(prev => ({ ...prev, upload: true }));
    try {
      let fileUrl = selectedLOC?.fileUrl || "";
      let fileName = selectedLOC?.fileName || "";

      if (locForm.file) {
        const storageRef = ref(storage, `locs/${locForm.locNumber}_Rev${locForm.revision}_${Date.now()}_${locForm.file.name}`);
        const snapshot = await uploadBytes(storageRef, locForm.file);
        fileUrl = await getDownloadURL(snapshot.ref);
        fileName = locForm.file.name;
      }

      const locData = {
        id: selectedLOC?.id || `${locForm.locNumber}_Rev${locForm.revision}`,
        locNumber: locForm.locNumber,
        revision: locForm.revision,
        startDate: locForm.startDate,
        endDate: locForm.endDate,
        dotSubmittalDate: locForm.dotSubmittalDate,
        planIds: locForm.planIds,
        notes: locForm.notes,
        fileUrl,
        fileName,
        uploadedBy: currentUser?.email || "Unknown",
        uploadedAt: new Date().toISOString()
      };

      if (selectedLOC && !locForm.isNewRevision) {
        await updateDoc(doc(db, "locs", selectedLOC.id), locData);
      } else {
        await setDoc(doc(db, "locs", `${locForm.locNumber}_Rev${locForm.revision}`), locData);
      }

      setShowLOCForm(false);
      setSelectedLOC(null);
      setLocForm({
        locNumber: "",
        revision: 1,
        startDate: "",
        endDate: "",
        dotSubmittalDate: "",
        planIds: [],
        notes: "",
        file: null
      });
    } catch (error) {
      console.error("Error submitting LOC:", error);
      showToast("Failed to submit LOC. Check permissions.", "error");
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
    }
  };

  // Permission Helpers
  const canView = (fieldKey: string) => {
    if (currentUser?.role === UserRole.ADMIN) return true;
    const permissions = fieldPermissions[fieldKey];
    if (!permissions || !permissions.view) {
      return true;
    }
    if (permissions.view.length === 0) {
      return false;
    }
    return permissions.view.includes(role);
  };
  const canViewMetrics = true;
  const canViewLogs = role === UserRole.MOT || role === UserRole.ADMIN;
  const canViewTickets = role === UserRole.MOT || role === UserRole.ADMIN;
  const canEditPlan = role !== UserRole.GUEST;
  const canCreateRequest = role === UserRole.SFTC || role === UserRole.MOT || role === UserRole.ADMIN;
  const canManageUsers = role === UserRole.MOT || role === UserRole.ADMIN;
  const canRequestAppChange = role === UserRole.MOT || role === UserRole.ADMIN;
  const canExport = role === UserRole.SFTC || role === UserRole.MOT || role === UserRole.ADMIN;

  useEffect(() => {
    if (view === "app_feedback" && !canManageApp) {
      setView("table");
    }
  }, [role, view, canManageApp]);

  useEffect(() => {
    document.title = appConfig.pageTitle || appConfig.appName || 'TCP Tracker';
  }, [appConfig.pageTitle, appConfig.appName]);

  if(!loaded) return <div style={{fontFamily:font,padding:60,textAlign:"center",color:"#94A3B8"}}>Loading...</div>;



  return (
    <>
      <div style={{fontFamily:font,background:"var(--bg-page)",color:"var(--text-secondary)",minHeight:"100vh"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>

      <datalist id="street-names">
        {STREET_NAMES.map(street => (
          <option key={street} value={street} />
        ))}
      </datalist>

      <AdminToolbar
        role={role}
        loading={loading}
        handleMasterUpload={handleMasterUpload}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        isPermissionEditingMode={isPermissionEditingMode}
        setIsPermissionEditingMode={setIsPermissionEditingMode}
        isRealAdmin={isRealAdmin}
        setView={setView}
        view={view}
      />
      <Header 
        view={view}
        setView={setView}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        handleLogout={handleLogout}
        setShowLogin={setShowLogin}
        canViewTickets={canViewTickets}
        canViewMetrics={canViewMetrics}
        canViewLogs={canViewLogs}
        canManageUsers={canManageUsers}
        canManageApp={canManageApp}
        canCreateRequest={canCreateRequest}
        canRequestAppChange={canRequestAppChange}
        setShowForm={setShowForm}
        setShowAppRequestModal={setShowAppRequestModal}
        setShowAppRequestSidebar={setShowAppRequestSidebar}
        appConfig={appConfig}
        isDark={isDark}
        toggleDark={toggleDark}
      />

      {/* SUMMARY STATS BAR */}
      {view === "table" && (
        <SummaryStatsBar
          metrics={metrics}
          hoveredMetricIndex={hoveredMetricIndex}
          setHoveredMetricIndex={setHoveredMetricIndex}
          currentUser={currentUser}
          plans={plans}
          td={td}
          TODAY={TODAY}
          filter={filter}
          setFilter={setFilter}
        />
      )}

      <div style={{padding:"20px 28px"}}>

        {/* REPORT SETTINGS VIEW */}
        {view === "settings" && currentUser?.role === UserRole.ADMIN && (
          <SettingsView
            appConfig={appConfig}
            setAppConfig={setAppConfig}
            role={role}
            users={users}
            setClearPlansConfirm={setClearPlansConfirm}
            onOpenImport={() => setShowImportWizard(true)}
            onExportCSV={exportToCSV}
          />
        )}

        {/* USER MANAGEMENT VIEW */}
        {view === "app_feedback" && canManageApp && (
          <div style={{padding:"20px 28px"}}>
            <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:32, alignItems:"start"}}>
              
              {/* Left Column: App Requests */}
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:32}}>
                  <div>
                    <h2 style={{fontSize:24,fontWeight:800,color:"#0F172A",marginBottom:16}}>App Change Requests</h2>
                    <div style={{display:"flex", gap:16}}>
                      <button 
                        onClick={() => setAppRequestTab("pending")}
                        style={{
                          padding: "10px 20px",
                          borderRadius: 8,
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: "pointer",
                          border: "none",
                          background: appRequestTab === "pending" ? "#6366F1" : "transparent",
                          color: appRequestTab === "pending" ? "#fff" : "#64748B",
                          transition: "all 0.2s"
                        }}
                      >
                        Pending ({appRequests.filter(r => r.status === "pending").length})
                      </button>
                      <button 
                        onClick={() => setAppRequestTab("completed")}
                        style={{
                          padding: "10px 20px",
                          borderRadius: 8,
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: "pointer",
                          border: "none",
                          background: appRequestTab === "completed" ? "#10B981" : "transparent",
                          color: appRequestTab === "completed" ? "#fff" : "#64748B",
                          transition: "all 0.2s"
                        }}
                      >
                        Completed ({appRequests.filter(r => r.status === "completed").length})
                      </button>
                    </div>
                  </div>
                  <div style={{fontSize:13,color:"#64748B",fontWeight:500,marginBottom:8}}>{appRequests.length} Total Requests</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(400px, 1fr))",gap:24}}>
                  {appRequests.filter(r => r.status === appRequestTab && (!searchQuery || (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase())) || (r.id && r.id.toLowerCase().includes(searchQuery.toLowerCase())) || (r.userName && r.userName.toLowerCase().includes(searchQuery.toLowerCase())) || (r.userEmail && r.userEmail.toLowerCase().includes(searchQuery.toLowerCase())))).map(req => (
                <div key={req.id} style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8F0",padding:24,display:"flex",flexDirection:"column",gap:20, position: "relative", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:15,fontWeight:800,color:"#1E293B",marginBottom:4,letterSpacing:"-0.01em"}}>{req.id}</div>
                      <div style={{fontSize:12,color:"#94A3B8",fontFamily:monoFont}}>{new Date(req.createdAt).toLocaleString()}</div>
                    </div>
                    <div style={{display: "flex", gap: 12, alignItems: "center"}}>
                      <div style={{background:req.status==="pending"?"#F59E0B":"#10B981",color:"#fff",padding:"4px 12px",borderRadius:20,fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.05em"}}>{req.status}</div>
                      
                      {deletingRequestId === req.id ? (
                        <div style={{display:"flex", alignItems:"center", gap:8, background:"#FEF2F2", padding:"4px 8px", borderRadius:8, border:"1px solid #FEE2E2"}}>
                          <span style={{fontSize:10, fontWeight:700, color:"#991B1B"}}>Delete?</span>
                          <button onClick={() => setDeletingRequestId(null)} style={{fontSize:10, color:"#64748B", border:"none", background:"transparent", cursor:"pointer", fontWeight:600}}>No</button>
                          <button onClick={async () => {
                            try {
                              await deleteDoc(doc(db, 'app_feedback', req.id));
                              setDeletingRequestId(null);
                            } catch (err) {
                              console.error("Delete failed:", err);
                              setDeletingRequestId(null);
                            }
                          }} style={{fontSize:10, color:"#EF4444", border:"none", background:"transparent", cursor:"pointer", fontWeight:800}}>Yes</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeletingRequestId(req.id)}
                          style={{background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer", padding: 4, transition: "color 0.2s"}}
                          onMouseEnter={(e) => e.currentTarget.style.color = "#EF4444"}
                          onMouseLeave={(e) => e.currentTarget.style.color = "#94A3B8"}
                          title="Delete Request"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{fontSize:14,color:"#334155",lineHeight:1.6,whiteSpace:"pre-wrap",fontWeight:500}}>{req.description}</div>
                  <div style={{fontSize:12,color:"#64748B"}}>By: <span style={{fontWeight:700,color:"#475569"}}>{req.userName}</span> <span style={{opacity:0.6}}>({req.userEmail})</span></div>
                  
                  {(req.screenshot || (req.files && req.files.length > 0)) && (
                    <div style={{display:"flex", flexDirection:"column", gap:12}}>
                      <div style={{fontSize:11,fontWeight:800,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.05em"}}>Attached Files & Screenshots</div>
                      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(120px, 1fr))", gap:16}}>
                        {req.screenshot && (
                          <div 
                            style={{aspectRatio:"1/1", borderRadius:12, overflow:"hidden", border:"1px solid #E2E8F0", background:"#F8FAFC", cursor:"zoom-in", transition:"all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow:"0 4px 6px -1px rgba(0,0,0,0.1)", position:"relative"}}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "translateY(-4px)";
                              e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0,0,0,0.1)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.1)";
                            }}
                            onClick={() => setPreviewImage(req.screenshot)}
                          >
                            <img 
                              src={req.screenshot} 
                              alt="Legacy Screenshot" 
                              style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}} 
                              referrerPolicy="no-referrer"
                            />
                            <div style={{position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,0.4), transparent)", opacity:0, transition:"opacity 0.2s", display:"flex", alignItems:"flex-end", padding:8}} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0"}>
                              <span style={{color:"#fff", fontSize:10, fontWeight:700}}>VIEW SCREENSHOT</span>
                            </div>
                          </div>
                        )}
                        {req.files && req.files.map((f: string, i: number) => {
                          const isImage = (f as string).startsWith("data:image/") || /\.(jpeg|jpg|gif|png|webp|svg)(\?|$)/i.test(f as string);
                          return (
                            <div key={i} style={{aspectRatio:"1/1", borderRadius:12, overflow:"hidden", border:"1px solid #E2E8F0", background:"#F8FAFC", cursor:"pointer", transition:"all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow:"0 4px 6px -1px rgba(0,0,0,0.1)", position:"relative"}}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = "translateY(-4px)";
                                e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0,0,0,0.1)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.1)";
                              }}
                              onClick={() => isImage ? setPreviewImage(f) : window.open(f)}
                            >
                              {isImage ? (
                                <>
                                  <img 
                                    src={f} 
                                    alt={`Attachment ${i+1}`} 
                                    style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}} 
                                    referrerPolicy="no-referrer"
                                  />
                                  <div style={{position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,0.4), transparent)", opacity:0, transition:"opacity 0.2s", display:"flex", alignItems:"flex-end", padding:8}} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0"}>
                                    <span style={{color:"#fff", fontSize:10, fontWeight:700}}>VIEW IMAGE</span>
                                  </div>
                                </>
                              ) : (
                                <div style={{height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, color:"#64748B", padding:12}}>
                                  <div style={{width:40, height:40, borderRadius:10, background:"#F1F5F9", display:"flex", alignItems:"center", justifyContent:"center", color:"#6366F1"}}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                                  </div>
                                  <span style={{fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em"}}>File {i+1}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{marginTop:"auto",paddingTop:20,borderTop:"1px solid #F1F5F9",display:"flex",gap:12}}>
                    <button onClick={async () => {
                      try {
                        await updateDoc(doc(db, 'app_feedback', req.id), { status: req.status === "pending" ? "completed" : "pending" });
                      } catch (err) {
                        console.error("Update failed:", err);
                      }
                    }} style={{flex:1,background:req.status === "pending" ? "#10B981" : "#F1F5F9",color:req.status === "pending" ? "#fff" : "#475569",border:"none",padding:"10px",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer", transition: "all 0.2s"}}>
                      {req.status === "pending" ? "Mark as Completed" : "Move back to Pending"}
                    </button>
                  </div>
                </div>
              ))}
              {appRequests.filter(r => r.status === appRequestTab).length === 0 && (
                <div style={{gridColumn:"1/-1",padding:80,textAlign:"center",background:"#fff",borderRadius:16,border:"1px dashed #CBD5E1",color:"#94A3B8", fontWeight:500}}>No {appRequestTab} requests</div>
              )}
            </div>
            </div>

            {/* Right Column: To-Do List */}
            <div style={{background: "#F8FAFC", borderRadius: 16, padding: 24, border: "1px solid #E2E8F0", position: "sticky", top: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", height: "calc(100vh - 120px)"}}>
              <h3 style={{fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 16, display: "flex", alignItems: "center", gap: 8}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: "#6366F1"}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                My Progression Tasks
              </h3>
              <TodoSidebar 
                appTodos={appTodos}
                newTodoText={newTodoText}
                setNewTodoText={setNewTodoText}
                todoCompletedExpanded={todoCompletedExpanded}
                setTodoCompletedExpanded={setTodoCompletedExpanded}
                onClose={() => setShowTodoSidebar(false)}
              />
            </div>
          </div>
        </div>
        )}

        {view==="users" && canManageUsers && (
          <UserManagementView
            users={users}
            currentUser={currentUser}
            role={role}
            plans={plans}
          />
        )}

        {/* CALENDAR VIEW */}
        {view==="calendar" && (
          <CalendarView
            TODAY={TODAY}
            filtered={filtered}
            hoveredPlanId={hoveredPlanId}
            setHoveredPlanId={setHoveredPlanId}
            setSelectedPlan={setSelectedPlan}
          />
        )}

        {/* METRICS VIEW */}
        {view==="metrics"&&(
          <MetricsView
            filtered={filtered}
            metrics={metrics}
            STAGES={STAGES}
            monoFont={monoFont}
            TODAY={TODAY}
            td={td}
            setSelectedPlan={setSelectedPlan}
            setView={setView}
            reportTemplate={reportTemplate}
          />
        )}

        {/* LOG VIEW */}
        {view==="log" && (
          <GlobalActivityLogView
            canViewLogs={canViewLogs}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            logCols={logCols}
            plans={plans}
            setSelectedPlan={setSelectedPlan}
            setView={setView}
            monoFont={monoFont}
          />
        )}

        {/* COMMUNITY RELATIONS VIEW */}
        {view==="community" && (
          <CommunityRelationsView
            activeImpactFilter={activeImpactFilter}
            setActiveImpactFilter={setActiveImpactFilter}
            communityCols={communityCols}
            requestCommunitySort={requestCommunitySort}
            communitySortConfig={communitySortConfig}
            sortedCommunity={sortedCommunity}
            monoFont={monoFont}
            setSelectedPlan={setSelectedPlan}
          />
        )}

        {/* TICKETS VIEW */}
        {view==="plan_requests" && (
          <TicketsView
            canViewTickets={canViewTickets}
            metrics={metrics}
            monoFont={monoFont}
            filtered={filtered}
            LEADS={LEADS}
            updatePlanField={updatePlanField}
            setSelectedPlan={setSelectedPlan}
            setView={setView}
            pushTicket={pushTicket}
            plans={plans}
          />
        )}

        {/* LOC MANAGER PORTAL */}
        {view === "locs" && (
          <LocManagerPortalView
            canManageUsers={canManageUsers}
            setSelectedLOC={setSelectedLOC}
            setLocForm={setLocForm}
            setShowLOCForm={setShowLOCForm}
            font={font}
            locCols={locCols}
            requestLocSort={requestLocSort}
            locSortConfig={locSortConfig}
            sortedLocs={sortedLocs}
            locs={locs}
          />
        )}

        {/* TABLE VIEW */}
        {view==="table"&&(
          <TableView
            STAGES={STAGES}
            plans={plans}
            filter={filter}
            setFilter={setFilter}
            monoFont={monoFont}
            font={font}
            inp={inp}
            PLAN_TYPES={PLAN_TYPES}
            LEADS={LEADS}
            PRIORITIES={PRIORITIES}
            canExport={canExport}
            exportToCSV={exportToCSV}
            loading={loading}
            canEditPlan={canEditPlan}
            selectedPlanIds={selectedPlanIds}
            bulkUpdate={handleBulkUpdate}
            currentUser={currentUser}
            setSelectedPlanIds={setSelectedPlanIds}
            filtered={filtered}
            toggleSelectAll={toggleSelectAll}
            mainCols={mainCols}
            requestSort={requestSort}
            sortConfig={sortConfig}
            sortedData={sortedData}
            TODAY={TODAY}
            td={td}
            toggleSelectPlan={toggleSelectPlan}
            setSelectedPlan={setSelectedPlan}
            isDark={isDark}
          />
        )}






      </div>

      {/* APP REQUEST MODAL */}
      {showNeedByWarningModal && (
        <div style={{position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000}}>
          <div style={{background:"#fff", padding:24, borderRadius:12, width:400, boxShadow:"0 10px 25px rgba(0,0,0,0.2)"}}>
            <h3 style={{marginTop:0, color:"#DC2626"}}>Warning: Short Need-By Date</h3>
            <p style={{color:"#475569", fontSize:14}}>{warningMessage}</p>
            <div style={{display:"flex", flexDirection:"column", gap:10}}>
              <button onClick={()=>{
                setForm(f => ({...f, isCriticalPath: true}));
                setShowNeedByWarningModal(false);
              }} style={{width:"100%", background:"#F59E0B", color:"#fff", border:"none", padding:"10px", borderRadius:8, fontWeight:700, cursor:"pointer"}}>Is this Critical Path Item?</button>
              <button onClick={()=>{
                setForm(f => ({...f, needByDate: ""}));
                setShowNeedByWarningModal(false);
              }} style={{width:"100%", background:"#DC2626", color:"#fff", border:"none", padding:"10px", borderRadius:8, fontWeight:700, cursor:"pointer"}}>Acknowledge</button>
            </div>
          </div>
        </div>
      )}

        <div style={{
          position: "fixed",
          top: 0,
          right: showAppRequestSidebar ? 0 : -400,
          width: 400,
          height: "100vh",
          background: "#fff",
          boxShadow: "-4px 0 16px rgba(0,0,0,0.1)",
          transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column"
        }}>
          <AppRequestSidebar
            onClose={() => setShowAppRequestSidebar(false)}
            form={appRequestForm}
            setForm={setAppRequestForm}
            onSubmit={submitAppRequest}
            onFileUpload={handleAppRequestFileUpload}
            isLoading={loading.appRequest}
            inp={inp}
            lbl={lbl}
          />
        </div>

      {/* LOGIN MODAL */}
      <LoginModal
        showLogin={showLogin}
        setShowLogin={setShowLogin}
        handleLogin={handleLogin}
        font={font}
      />

      {/* USER FORM MODAL */}
      
      {/* BULK LOC UPLOAD MODAL */}
      {showBulkLOCModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
          <div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:500,boxShadow:"0 25px 50px rgba(0,0,0,0.15)"}}>
            <div style={{fontSize:20,fontWeight:800,color:"#0F172A",marginBottom:8}}>Bulk Upload LOC</div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:24,lineHeight:1.5}}>
              Upload a Letter of Consent (LOC) and attach it to the <strong>{selectedPlanIds.length}</strong> selected plans. 
              This will update the approved LOCs and add an activity log entry for each plan.
            </div>

            <div style={{marginBottom:24}}>
              <label style={{...lbl, marginBottom:8}}>Select LOC File</label>
              <div style={{border:"2px dashed #E2E8F0", borderRadius:12, padding:24, textAlign:"center", background:"#F8FAFC", cursor:"pointer", position:"relative"}}>
                <input 
                  type="file" 
                  onChange={(e) => setBulkLOCFile(e.target.files?.[0] || null)} 
                  style={{position:"absolute", inset:0, opacity:0, cursor:"pointer"}}
                />
                <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:8}}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  <div style={{fontSize:13, fontWeight:600, color:bulkLOCFile ? "#0F172A" : "#64748B"}}>
                    {bulkLOCFile ? bulkLOCFile.name : "Click or drag file to upload"}
                  </div>
                  {bulkLOCFile && <div style={{fontSize:11, color:"#94A3B8"}}>{formatFileSize(bulkLOCFile.size)}</div>}
                </div>
              </div>
            </div>

            {loading.bulk && (
              <div style={{marginBottom:24}}>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:11, fontWeight:700, color:"#64748B", marginBottom:6}}>
                  <span>Processing Plans...</span>
                  <span>{bulkLOCProgress}%</span>
                </div>
                <div style={{height:6, background:"#F1F5F9", borderRadius:3, overflow:"hidden"}}>
                  <div style={{height:"100%", background:"#0D9488", width:`${bulkLOCProgress}%`, transition:"width 0.3s ease"}} />
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:12}}>
              <button onClick={() => { setShowBulkLOCModal(false); setBulkLOCFile(null); }} disabled={loading.bulk} style={{flex:1,background:"#F1F5F9",color:"#475569",border:"none",padding:"12px",borderRadius:8,fontWeight:700,cursor:"pointer"}}>Cancel</button>
              <button 
                onClick={handleBulkLOCUpload} 
                disabled={loading.bulk || !bulkLOCFile} 
                style={{flex:1,background:"#0D9488",color:"#fff",border:"none",padding:"12px",borderRadius:8,fontWeight:700,cursor: (loading.bulk || !bulkLOCFile) ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8}}
              >
                {loading.bulk ? <Spinner size={16} color="#fff" /> : "Process & Attach"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* CLEAR PLANS CONFIRMATION MODAL */}
      {clearPlansConfirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
          <div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:400,boxShadow:"0 25px 50px rgba(0,0,0,0.15)", textAlign:"center"}}>
            <div style={{width:48,height:48,background:"#FEF2F2",borderRadius:24,display:"flex",alignItems:"center",justifyContent:"center",color:"#EF4444",margin:"0 auto 16px"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:8}}>Warning: Wipe TCP Tracker</div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:24,lineHeight:1.5}}>
              This will permanently delete <strong>ALL</strong> plans, logs, and associated data from the database. This action cannot be undone. Are you absolutely sure you want to proceed?
            </div>
            <div style={{display:"flex",gap:12}}>
              <button onClick={() => setClearPlansConfirm(false)} style={{flex:1,background:"#F1F5F9",color:"#475569",border:"none",padding:"10px",borderRadius:8,fontWeight:700,cursor:"pointer"}}>Cancel</button>
              <button onClick={handleClearPlans} style={{flex:1,background:"#EF4444",color:"#fff",border:"none",padding:"10px",borderRadius:8,fontWeight:700,cursor:"pointer"}}>
                {loading.bulk ? "Wiping..." : "Yes, Wipe Tracker"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT WIZARD */}
      {showImportWizard && (
        <ImportWizard
          step={wizardStep}
          setStep={setWizardStep}
          mappingHeaders={mappingHeaders}
          mappingData={mappingData}
          columnMapping={columnMapping}
          setColumnMapping={setColumnMapping}
          importRows={importRows}
          updateImportRow={updateImportRow}
          onFileChange={handleMasterUpload}
          onProceedToValidation={handleProceedToValidation}
          onProceedToReview={handleProceedToReview}
          onConfirm={confirmImport}
          onCancel={resetImport}
        />
      )}

      {/* NEW REQUEST MODAL */}
      <NewRequestModal
        showForm={showForm}
        setShowForm={setShowForm}
        onCancel={resetForm}
        form={form}
        setForm={setForm}
        currentUser={currentUser}
        canView={canView}
        reportTemplate={reportTemplate}
        setWarningMessage={setWarningMessage}
        setShowNeedByWarningModal={setShowNeedByWarningModal}
        handleSubmit={handleSubmit}
        loading={loading}
        motAllAnswered={motAllAnswered}
      />

      {/* LOC FORM MODAL */}
      <LOCFormModal
        showLOCForm={showLOCForm}
        setShowLOCForm={setShowLOCForm}
        selectedLOC={selectedLOC}
        locForm={locForm}
        setLocForm={setLocForm}
        planSearch={planSearch}
        setPlanSearch={setPlanSearch}
        plans={plans}
        submitLOC={submitLOC}
        uploadLoading={loading.upload}
        inp={inp}
        lbl={lbl}
        font={font}
      />

      {/* PLAN DETAIL MODAL */}
      {selectedPlan && (
        <PlanCard />
      )}
              {selectedPlan && (
                <div style={{display:"flex", flexDirection:"column", gap:8}}>
                  <div style={{display:"flex", gap:8}}>
                    <input 
                      type="text" 
                      placeholder="e.g. Followed up with DOT... (Paste images/files here)" 
                      style={{...inp, flex:1}} 
                      value={logEntryForm.text || ""}
                      onChange={(e) => setLogEntryForm(prev => ({ ...prev, text: e.target.value }))}
                      onPaste={(e) => {
                        const items = e.clipboardData.items;
                        const files: File[] = [];
                        for (let i = 0; i < items.length; i++) {
                          if (items[i].type.indexOf("image") !== -1 || items[i].type.indexOf("pdf") !== -1 || items[i].kind === 'file') {
                            const blob = items[i].getAsFile();
                            if (blob) files.push(blob);
                          }
                        }
                        if (files.length > 0) {
                          setLogEntryForm(prev => ({ ...prev, attachments: [...prev.attachments, ...files] }));
                        }
                      }}
                      onKeyDown={(e: any)=>{
                        if(e.key==="Enter" && (logEntryForm.text || logEntryForm.attachments.length > 0)){
                          addLogEntry(selectedPlan.id, logEntryForm.text, logEntryForm.attachments);
                          setLogEntryForm({ text: "", attachments: [] });
                        }
                      }}
                    />
                    <label style={{background:"#F1F5F9", color:"#64748B", padding:"9px 12px", borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center"}}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                      <input type="file" multiple style={{display:"none"}} onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setLogEntryForm(prev => ({ ...prev, attachments: [...prev.attachments, ...files] }));
                      }} />
                    </label>
                    <button 
                      onClick={()=>{
                        if(logEntryForm.text || logEntryForm.attachments.length > 0){
                          addLogEntry(selectedPlan.id, logEntryForm.text, logEntryForm.attachments);
                          setLogEntryForm({ text: "", attachments: [] });
                        }
                      }} 
                      style={{background:"#0F172A",color:"#fff",border:"none",padding:"9px 16px",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:11,fontFamily:font}}
                    >
                      Add
                    </button>
                  </div>
                  {logEntryForm.attachments.length > 0 && (
                    <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                      {logEntryForm.attachments.map((f, i) => (
                        <div key={i} style={{display:"flex", alignItems:"center", gap:4, background:"#F1F5F9", padding:"4px 8px", borderRadius:6, fontSize:10, color:"#475569"}}>
                          <span style={{maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{f.name}</span>
                          <button onClick={() => setLogEntryForm(prev => ({ ...prev, attachments: prev.attachments.filter((_, idx) => idx !== i) }))} style={{border:"none", background:"transparent", color:"#94A3B8", cursor:"pointer", padding:0}}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5">
                {selectedPlan && (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      {isPermissionEditingMode && currentUser?.role === UserRole.ADMIN && (
                        <PermissionToggle
                          fieldName="Activity Log"
                          allowedEditRoles={fieldPermissions['activity_log']?.edit || []}
                          allowedViewRoles={fieldPermissions['activity_log']?.view || []}
                          onToggleEdit={(role) => setFieldPermissions(prev => ({ ...prev, activity_log: { ...prev.activity_log, edit: prev.activity_log?.edit?.includes(role) ? prev.activity_log.edit.filter(r => r !== role) : [...(prev.activity_log?.edit || []), role] } }))}
                          onToggleView={(role) => setFieldPermissions(prev => ({ ...prev, activity_log: { ...prev.activity_log, view: prev.activity_log?.view?.includes(role) ? prev.activity_log.view.filter(r => r !== role) : [...(prev.activity_log?.view || []), role] } }))}
                        />
                      )}
                    </div>
                    <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, overflow: "hidden" }}>
                      {[...selectedPlan.log].map((l, idx) => ({ ...l, originalIndex: idx })).reverse().filter(l => !l.action.includes("Status → Implemented")).map((entry, i) => {
                        const originalIndex = entry.originalIndex;
                        return (
                          <div key={originalIndex} style={{ display: "flex", gap: 12, padding: "10px 12px", borderBottom: i < selectedPlan.log.length - 1 ? "1px solid #F1F5F9" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFC", alignItems: "flex-start", paddingLeft: entry.action.startsWith("  ") ? "40px" : "12px" }}>
                            {(currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN) ? (
                              <input
                                type="date"
                                value={entry.date || ""}
                                onChange={(e) => updateLogEntry(selectedPlan.id, originalIndex, "date", e.target.value)}
                                style={{ fontSize: 10, fontFamily: monoFont, color: "#94A3B8", background: "transparent", border: "none", width: 90, marginTop: 2 }}
                              />
                            ) : (
                              <div style={{ fontSize: 10, fontFamily: monoFont, color: "#94A3B8", minWidth: 72, paddingTop: 3 }}>{entry.date || ""}</div>
                            )}

                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                              {entry.dateRequested && <div style={{ fontSize: 9, color: "#64748B", fontWeight: 600 }}>Requested: {entry.dateRequested}</div>}
                              {(currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN) ? (
                                <input
                                  type="text"
                                  value={entry.action || ""}
                                  onChange={(e) => updateLogEntry(selectedPlan.id, originalIndex, "action", e.target.value)}
                                  style={{ fontSize: 12, color: "#334155", width: "100%", background: "transparent", border: "none", outline: "none" }}
                                />
                              ) : (
                                <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.4 }}>{entry.action || ""}</div>
                              )}
                              {entry.attachments && entry.attachments.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                                  {entry.attachments.map((file: any, fIdx: number) => (
                                    <button
                                      key={fIdx}
                                      onClick={() => {
                                        if (file.data) {
                                          if (file.data.startsWith('http')) {
                                            window.open(file.data, '_blank');
                                          } else {
                                            const win = window.open();
                                            if (win) {
                                              win.document.write(`<iframe src="${file.data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                            }
                                          }
                                        } else if (file instanceof File) {
                                          window.open(URL.createObjectURL(file), '_blank');
                                        }
                                      }}
                                      style={{ display: "flex", alignItems: "center", gap: 4, background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "4px 8px", borderRadius: 6, fontSize: 9, color: "#64748B", cursor: "pointer" }}
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                      {file.name || "Attachment"}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {(currentUser?.role === UserRole.MOT || currentUser?.role === UserRole.ADMIN) ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                                <input
                                  type="text"
                                  value={entry.user || ""}
                                  onChange={(e) => updateLogEntry(selectedPlan.id, originalIndex, "user", e.target.value)}
                                  style={{ fontSize: 10, fontWeight: 600, color: "#64748B", textAlign: "right", background: "transparent", border: "none", width: 100 }}
                                />
                                <button
                                  onClick={() => deleteLogEntry(selectedPlan.id, entry.uniqueId)}
                                  style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 12, padding: 0 }}
                                  title="Delete Entry"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", textAlign: "right", paddingTop: 3 }}>{entry.user}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {submissionSuccess.show && (
                  <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                    <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 400, padding: 32, textAlign: "center", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
                      <div style={{ width: 64, height: 64, background: "#DCFCE7", borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                      <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Request Submitted!</h3>
                      <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.5, marginBottom: 24 }}>
                        Your request <span style={{ fontFamily: monoFont, fontWeight: 700, color: "#0F172A" }}>{submissionSuccess.id}</span> has been received.
                        <br /><br />
                        You are currently <span style={{ fontSize: 18, fontWeight: 800, color: "#F59E0B" }}>#{submissionSuccess.pos}</span> in the queue.
                      </p>
                      <button
                        onClick={() => setSubmissionSuccess({ show: false, pos: 0, id: "" })}
                        style={{ width: "100%", background: "#0F172A", color: "#fff", border: "none", padding: "12px", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: font }}
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                )}
              </div>

      {/* Global Todo Sidebar for Admin & MOT */}
      {(role === UserRole.MOT || role === UserRole.ADMIN) && view !== "app_feedback" && (
        <>
          {/* Right sidebar tabs */}
          <div style={{ position: "fixed", right: 0, top: "40%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 4, zIndex: 990 }}>
          <button
            onClick={() => setShowTodoSidebar(true)}
            style={{
              background: "#0F172A",
              color: "#fff",
              border: "none",
              padding: "16px 8px",
              borderTopLeftRadius: 8,
              borderBottomLeftRadius: 8,
              cursor: "pointer",
              boxShadow: "-2px 0 8px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              fontWeight: 700,
              letterSpacing: 1,
              transition: "background 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#1E293B"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#0F172A"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform: "rotate(90deg)"}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            TASKS
          </button>

          <button
            onClick={() => setShowAppRequestSidebar(true)}
            style={{
              background: "#6366F1",
              color: "#fff",
              border: "none",
              padding: "16px 8px",
              borderTopLeftRadius: 8,
              borderBottomLeftRadius: 8,
              cursor: "pointer",
              boxShadow: "-2px 0 8px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: 1,
              transition: "background 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#4F46E5"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#6366F1"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform: "rotate(90deg)"}}><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            App Req
          </button>
          </div>

          <div style={{
            position: "fixed",
            top: 0,
            right: showTodoSidebar ? 0 : -400,
            width: 400,
            height: "100vh",
            background: "#F8FAFC",
            boxShadow: "-4px 0 16px rgba(0,0,0,0.1)",
            transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column"
          }}>
            <div style={{padding: "20px 24px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff"}}>
              <h3 style={{fontSize: 18, fontWeight: 800, color: "#0F172A", display: "flex", alignItems: "center", gap: 8, margin: 0}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: "#6366F1"}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                Progression Tasks
              </h3>
              <button 
                onClick={() => setShowTodoSidebar(false)}
                style={{background: "transparent", border: "none", color: "#64748B", cursor: "pointer", padding: 4}}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div style={{flex: 1, overflow: "hidden", padding: 24}}>
              <TodoSidebar 
                appTodos={appTodos}
                newTodoText={newTodoText}
                setNewTodoText={setNewTodoText}
                todoCompletedExpanded={todoCompletedExpanded}
                setTodoCompletedExpanded={setTodoCompletedExpanded}
                onClose={() => setShowTodoSidebar(false)}
              />
            </div>
          </div>
          
          {showTodoSidebar && (
            <div 
              onClick={() => setShowTodoSidebar(false)}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(15,23,42,0.3)",
                backdropFilter: "blur(2px)",
                zIndex: 998
              }}
            />
          )}

          {previewImage && (
            <div 
              onClick={() => setPreviewImage(null)}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(15,23,42,0.8)",
                backdropFilter: "blur(8px)",
                zIndex: 2000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 40,
                cursor: "zoom-out"
              }}
            >
              <div style={{position: "relative", maxWidth: "90%", maxHeight: "90%"}}>
                <img 
                  src={previewImage} 
                  alt="Preview" 
                  style={{maxWidth: "100%", maxHeight: "100%", borderRadius: 16, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", display: "block"}} 
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}
                  style={{
                    position: "absolute",
                    top: -20,
                    right: -20,
                    background: "#fff",
                    border: "none",
                    borderRadius: "50%",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    color: "#0F172A"
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </div>
      <ToastContainer />
    </>
  )
}

