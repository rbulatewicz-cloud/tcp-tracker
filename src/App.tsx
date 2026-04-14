/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { bulkUpdate } from './services/planService';
import * as XLSX from 'xlsx';
import { ImportWizard } from './components/ImportWizard';
import { useState, useEffect, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import { db, loginWithGoogle, logout, storage } from './firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { UserManagementView } from './views/UserManagementView';
import { SummaryStatsBar } from './components/SummaryStatsBar';
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
import { TicketsView } from './views/TicketsView';
import { LocManagerPortalView } from './views/LocManagerPortalView';
import { ComplianceView } from './views/ComplianceView';
import VarianceLibraryView from './views/VarianceLibraryView';
import { CRHubView } from './views/CRHubView';
import CorridorMapView from './views/CorridorMapView';
import ReferenceView from './views/ReferenceView';
import { AppFeedbackView } from './views/AppFeedbackView';
import { GanttView } from './views/GanttView';
import { ReportsView } from './views/ReportsView';
import { MyRequestsModal } from './views/MyRequestsModal';
import { daysBetween, formatFileSize, calcMetrics, getLocalDateString } from './utils/plans';
import { TodoSidebar } from './components/TodoSidebar';
import { Tooltip } from './components/Tooltip';
import { AppRequestSidebar } from './features/appRequests/AppRequestSidebar';
import { ToastContainer } from './components/ToastContainer';
import { showToast } from './lib/toast';
import { UserRole, Plan, NoiseVariance, FilterState } from './types';
import {
  STAGES, PLAN_TYPES, PRIORITIES, LEADS, STREET_NAMES,
  FONT as font, MONO_FONT as monoFont,
  MOT_FIELDS,
  COMPLETED_STAGES,
  APPROVED_STAGES,
} from './constants';

import { useMasterFileImport } from './hooks/useMasterFileImport';
import { usePlanForm } from './hooks/usePlanForm';
import { PlanCard } from './components/PlanCard';
import { AppProvider } from './context/AppProvider';
import { AppListsProvider } from './context/AppListsContext';
import { useApp } from './hooks/useApp';
import { useDarkMode } from './hooks/useDarkMode';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ProfileModal } from './components/ProfileModal';
import { HelpModal } from './components/HelpModal';
import * as authService from './services/authService';
import { useNotifications } from './hooks/useNotifications';
import { subscribeToVariances } from './services/varianceService';
import { subscribeToGlobalLog, GlobalLogEntry } from './services/logService';

const TODAY = new Date();
const td = getLocalDateString();

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
  const { uiState, planManagement, tableState, auth, firestoreData, permissions, planActions, locManagement } = useApp();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const {
    view, setView,
    showForm, setShowForm,
    showAppRequestModal, setShowAppRequestModal,
    showAppRequestSidebar, setShowAppRequestSidebar,
    showNeedByWarningModal, setShowNeedByWarningModal,
    showMyRequests, setShowMyRequests,
    warningMessage, setWarningMessage,
    showTodoSidebar, setShowTodoSidebar,
    todoCompletedExpanded, setTodoCompletedExpanded,
    hoveredPlanId, setHoveredPlanId,
    hoveredMetricIndex, setHoveredMetricIndex,
    previewImage, setPreviewImage,
    deletingRequestId, setDeletingRequestId,
    isPermissionEditingMode, setIsPermissionEditingMode,
    showLOCForm, setShowLOCForm,
    submissionSuccess, setSubmissionSuccess,
    clearPlansConfirm, setClearPlansConfirm,
    loading, setLoading
  } = uiState;
  const {
    selectedPlan, setSelectedPlan,
    filter, setFilter,
    sortConfig, setSortConfig,
    planSearch, setPlanSearch,
    selectedPlanIds, setSelectedPlanIds
  } = planManagement;
  const {
    mainCols,
    locCols,
    logCols,
    locSortConfig, setLocSortConfig,
    searchQuery, setSearchQuery
  } = tableState;
  const { currentUser, setCurrentUser, isRealAdmin, loaded, showLogin, setShowLogin, profileComplete, role, canManageApp } = auth;
  const {
    appRequestForm, setAppRequestForm,
    handleAppRequestFileUpload,
    submitAppRequest
  } = useAppRequests(currentUser, loading, setLoading, showAppRequestModal, setShowAppRequestModal);
  const [newTodoText, setNewTodoText] = useState("");
  const [appRequestTab, setAppRequestTab] = useState<"pending" | "completed">("pending");
  // Profile modal state
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalTab, setProfileModalTab]   = useState<'profile' | 'notifications'>('profile');
  const [showHelp, setShowHelp] = useState(false);

  const openProfile = (tab: 'profile' | 'notifications') => {
    setProfileModalTab(tab);
    setProfileModalOpen(true);
  };

  // Notifications
  const [notifOpen, setNotifOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(currentUser?.email);

  // Library variances — loaded globally so TableView, CalendarView, and CSV export can use them
  const [libraryVariances, setLibraryVariances] = useState<NoiseVariance[]>([]);
  useEffect(() => subscribeToVariances(setLibraryVariances), []);
  const [globalLogs, setGlobalLogs] = useState<GlobalLogEntry[]>([]);
  useEffect(() => subscribeToGlobalLog(setGlobalLogs), []);

  // Show welcome screen for new users (profileComplete === false, not null)
  const showWelcomeScreen = loaded && !!currentUser && profileComplete === false;

  const { plans, locs, users, appRequests, appTodos, reportTemplate, appConfig, setAppConfig } = firestoreData;

  // Auto-open a plan card when ?plan=LOC-XXX is in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const locParam = params.get('plan');
    if (!locParam || !plans?.length) return;
    const target = plans.find(p => (p.loc || p.id) === locParam);
    if (target) {
      setSelectedPlan(target);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [plans]);
  const { fieldPermissions } = permissions;

  const getUserLabel = () => {
    if (!currentUser) return "Guest";
    return `${currentUser.name} (${currentUser.role})`;
  };

  const {
    pushTicket,
    handleClearPlans,
    updatePlanField,
  } = planActions;

  const {
    selectedLOC, setSelectedLOC,
    locForm, setLocForm,
    showBulkLOCModal, setShowBulkLOCModal,
    bulkLOCFile, setBulkLOCFile,
    bulkLOCProgress,
    handleBulkLOCUpload: handleBulkLOCUploadService
  } = locManagement;
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

  const handleSubmit = useCallback(() => handlePlanSubmit(motAllAnswered), [handlePlanSubmit, motAllAnswered]);

  const handleBulkUpdate = useCallback(async (updates: Partial<Plan>, date: string | null) => {
    await bulkUpdate(selectedPlanIds, plans, updates, date, currentUser, UserRole, setLoading, setSelectedPlanIds, getUserLabel, td);
  }, [selectedPlanIds, plans, currentUser, setLoading, setSelectedPlanIds, getUserLabel]);

  const handleBulkLOCUpload = useCallback(() => handleBulkLOCUploadService(), [handleBulkLOCUploadService]);

  const stageLabelMap = useMemo(() => new Map(STAGES.map(s => [s.key, s.label])), []);

  const filtered = useMemo(() => plans.filter(p => {
    // Normalize legacy stage keys so filter matches the pipeline bar counts
    const normalizedStage = p.stage === 'approved' ? 'plan_approved'
      : p.stage === 'submitted' ? 'submitted_to_dot'
      : p.stage;
    if(filter.stage!=="all"&&normalizedStage!==filter.stage) return false;
    if(filter.type!=="all"&&p.type!==filter.type) return false;
    if(filter.lead!=="all"&&p.lead!==filter.lead) return false;
    if(filter.priority!=="all"&&p.priority!==filter.priority) return false;
    if(filter.importStatus==="needs_review"&&p.importStatus!=="needs_review") return false;
    if(filter.importStatus==="tbd"&&p.locStatus!=="unassigned") return false;
    if(filter.requestedBy!=="all"&&p.requestedBy!==filter.requestedBy) return false;
    if(filter.scope!=="all"&&p.scope!==filter.scope) return false;

    // Quick filter pills
    if (filter.quickFilter === 'my_plans') {
      const TERMINAL = ['approved','plan_approved','implemented','tcp_approved_final','closed','cancelled','expired'];
      if (TERMINAL.includes(p.stage)) return false;
      const userName = currentUser?.name || '';
      const firstName = userName.split(' ')[0];
      const userEmail = currentUser?.email || '';
      const isLead = p.lead === userName || p.lead === firstName;
      const isSubscribed = userEmail && (p.subscribers ?? []).includes(userEmail);
      if (!isLead && !isSubscribed) return false;
    }
    if (filter.quickFilter === 'at_risk') {
      const INACTIVE = ['approved','plan_approved','implemented','tcp_approved_final','closed','cancelled','expired'];
      if (INACTIVE.includes(p.stage)) return false;
      if (!p.needByDate) return false;
      const daysLeft = Math.ceil((new Date(p.needByDate + 'T00:00:00').getTime() - TODAY.getTime()) / 86_400_000);
      if (daysLeft > 14) return false;
    }
    if (filter.quickFilter === 'needs_compliance') {
      const phe = p.compliance?.phe;
      const nv  = p.compliance?.noiseVariance;
      const cd  = p.compliance?.cdConcurrence;
      const phePending = phe && !['approved','not_started','expired'].includes(phe.status);
      const nvPending  = nv  && !['approved','linked_existing','not_started'].includes(nv.status);
      const cdPending  = cd  && (cd.cds ?? []).some((c: any) =>
        c.applicable && c.status !== 'na' && c.status !== 'concurred'
      );
      if (!phePending && !nvPending && !cdPending) return false;
    }
    if (filter.quickFilter === 'overdue_dot') {
      const AT_DOT = ['submitted_to_dot','dot_review','resubmit_review','loc_review'];
      if (!AT_DOT.includes(p.stage)) return false;
      if (!p.submitDate) return false;
      if (daysBetween(p.submitDate, td) <= 20) return false;
    }

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
  }), [plans, filter, searchQuery, stageLabelMap, currentUser, TODAY, td]);

  // Search-only filtered set for views that manage their own layout (CR Hub,
  // Compliance, Library) — applies the search query but NOT quick-filter pills
  // or stage/scope filters, so navigating from "My Plans" doesn't bleed in.
  const searchFiltered = useMemo(() => {
    if (!searchQuery) return plans;
    const q = searchQuery.toLowerCase();
    return plans.filter(p => {
      const stageLabel = stageLabelMap.get(p.stage) || p.stage;
      return (
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
        (p.id != null && String(p.id).toLowerCase().includes(q))
      );
    });
  }, [plans, searchQuery, stageLabelMap]);

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
      aValue = parseFloat(String(a.loc ?? '').replace(/^LOC-/i, '')) || 0;
      bValue = parseFloat(String(b.loc ?? '').replace(/^LOC-/i, '')) || 0;
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
      const headers = ["Plan #", "Rev", "LOC #", "Type", "Scope", "Seg", "Location", "Lead", "Priority", "Status", "Submitted", "Need By", "Wait", "PHE Status", "NV Status", "NV Expiry", "DN Sent", "CD Status"];
      const rows = sortedData.map(plan => {
        const stage = stageLabelMap.get(plan.stage) || plan.stage;
        const wd = plan.submitDate && !COMPLETED_STAGES.includes(plan.stage)
          ? daysBetween(plan.submitDate, td)
          : plan.submitDate && plan.approvedDate
            ? daysBetween(plan.submitDate, plan.approvedDate)
            : null;
        const waitStr = APPROVED_STAGES.includes(plan.stage) ? "Approved" : wd !== null ? `${wd}d` : "—";

        // Compliance columns
        const pheStatus  = plan.compliance?.phe?.status ?? "—";
        const nvStatus   = plan.compliance?.noiseVariance?.status ?? "—";
        const linked     = plan.compliance?.noiseVariance?.linkedVarianceId
          ? libraryVariances.find(v =>
              v.id === plan.compliance!.noiseVariance!.linkedVarianceId ||
              (v.parentVarianceId ?? v.id) === plan.compliance!.noiseVariance!.linkedVarianceId
            )
          : null;
        const nvExpiry   = linked?.validThrough ?? "—";
        const dn         = plan.compliance?.drivewayNotices;
        const dnSent     = dn ? `${dn.addresses.filter(a => a.noticeSent).length}/${dn.addresses.length}` : "—";
        const cdConcurrence = plan.compliance?.cdConcurrence;
        const cdStatus   = cdConcurrence
          ? cdConcurrence.cds.filter(e => e.applicable).map(e => `${e.cd}:${e.status}`).join('; ') || cdConcurrence.status
          : "—";

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
          waitStr,
          pheStatus,
          nvStatus,
          nvExpiry,
          dnSent,
          cdStatus,
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

  const exportToExcel = useCallback(() => {
    setLoading(prev => ({ ...prev, export: true }));
    setTimeout(() => {
      const headers = [
        '✓', 'LOC #', 'Type', 'Scope', 'Segment', 'Location',
        'Lead', 'Status', 'Need By', 'PHE', 'NV', 'DN Sent', 'Notes',
      ];

      const rows = sortedData.map(plan => {
        const stage = stageLabelMap.get(plan.stage) || plan.stage;
        const dn = plan.compliance?.drivewayNotices;
        const dnSent = dn
          ? `${dn.addresses.filter((a: any) => a.noticeSent).length}/${dn.addresses.length}`
          : '';
        return [
          '',                                                              // checkbox
          plan.loc || plan.id,
          plan.type        || '',
          plan.scope       || '',
          plan.segment     || '',
          `${plan.street1 || ''}${plan.street2 ? ` / ${plan.street2}` : ''}`,
          plan.lead        || '',
          stage,
          plan.needByDate  || '',
          plan.compliance?.phe?.status             || '',
          plan.compliance?.noiseVariance?.status   || '',
          dnSent,
          '',                                                              // Notes — blank for filling in
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Column widths
      ws['!cols'] = [
        { wch: 3  },  // ✓
        { wch: 12 },  // LOC #
        { wch: 14 },  // Type
        { wch: 16 },  // Scope
        { wch: 9  },  // Segment
        { wch: 32 },  // Location
        { wch: 12 },  // Lead
        { wch: 22 },  // Status
        { wch: 12 },  // Need By
        { wch: 12 },  // PHE
        { wch: 12 },  // NV
        { wch: 9  },  // DN Sent
        { wch: 36 },  // Notes
      ];

      // Freeze header row so it stays visible when scrolling
      ws['!views'] = [{ state: 'frozen', ySplit: 1 }];

      const wb = XLSX.utils.book_new();
      const dateStr = new Date().toISOString().split('T')[0];
      const sheetName = `Plans ${dateStr}`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `TCP_Plans_${dateStr}.xlsx`);
      setLoading(prev => ({ ...prev, export: false }));
    }, 100);
  }, [sortedData, stageLabelMap, setLoading]);

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
  // Resolve which tabs this role can see — config-driven with hardcoded defaults as fallback
  const _defaultTabVis: Record<string, string[]> = {
    GUEST:  ['table', 'corridor', 'calendar'],
    SFTC:   ['table', 'corridor', 'calendar', 'metrics', 'plan_requests', 'timeline', 'reports', 'compliance', 'variances', 'reference'],
    MOT:    ['table', 'corridor', 'calendar', 'metrics', 'plan_requests', 'timeline', 'reports', 'compliance', 'variances', 'reference', 'users', 'log'],
    CR:     ['table', 'corridor', 'calendar', 'cr_hub', 'compliance', 'variances', 'reference'],
    DOT:    ['table', 'corridor', 'calendar', 'variances', 'reference'],
    METRO:  ['table', 'corridor', 'calendar', 'compliance', 'variances', 'reference'],
    ADMIN:  ['table', 'corridor', 'calendar', 'metrics', 'plan_requests', 'timeline', 'reports', 'cr_hub', 'compliance', 'variances', 'reference', 'users', 'log'],
  };
  const _effectiveTabs: string[] = role === UserRole.ADMIN
    ? _defaultTabVis.ADMIN
    : (appConfig.tabVisibility?.[role ?? ''] ?? _defaultTabVis[role ?? ''] ?? ['table']);
  const canViewTab = (key: string) => role === UserRole.ADMIN || _effectiveTabs.includes(key);

  const canViewMetrics = canViewTab('metrics');
  const canViewLogs = canViewTab('log');
  const canViewTickets = canViewTab('plan_requests');
  const canEditPlan = role !== UserRole.GUEST && role !== UserRole.DOT && role !== UserRole.METRO;
  const canCreateRequest = role === UserRole.SFTC || role === UserRole.MOT || role === UserRole.ADMIN;
  const canManageUsers = role === UserRole.MOT || role === UserRole.ADMIN;
  const canRequestAppChange = role === UserRole.MOT || role === UserRole.ADMIN;
  const canViewCompliance = canViewTab('compliance');
  const canViewCRHub = canViewTab('cr_hub');
  const canExport = role === UserRole.SFTC || role === UserRole.MOT || role === UserRole.ADMIN;

  useEffect(() => {
    if (view === "app_feedback" && !canManageApp) {
      setView("table");
    }
  }, [role, view, canManageApp]);

  // Notification click → navigate to the relevant item
  const handleNotifNavigate = (n: import('./types').AppNotification) => {
    if (n.type === 'cd_overdue' || n.type === 'cd_warning' || n.type === 'missing_slide') {
      // Go to CR Hub → CD Concurrence tab
      setView(canViewCRHub ? 'cr_hub' : 'variances');
      // If there's a planId, also open the plan card
      if (n.planId) {
        const plan = plans.find(p => p.id === n.planId);
        if (plan) setSelectedPlan(plan);
      }
    } else if (n.planId) {
      const plan = plans.find(p => p.id === n.planId);
      if (plan) {
        setView('table');
        setSelectedPlan(plan);
      }
    } else if (n.type === 'feedback_comment' || n.type === 'feedback_updated') {
      // App request notification — go to the feedback view
      if (canManageApp) setView('app_feedback');
    } else {
      setView('metrics');
    }
  };

  useEffect(() => {
    document.title = appConfig.pageTitle || appConfig.appName || 'TCP Tracker';
  }, [appConfig.pageTitle, appConfig.appName]);

  if(!loaded) return <div style={{fontFamily:font,padding:60,textAlign:"center",color:"#94A3B8"}}>Loading...</div>;



  return (
    <AppListsProvider appConfig={appConfig}>
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
        canViewCompliance={canViewCompliance}
        canViewCRHub={canViewCRHub}
        canViewTab={canViewTab}
        canCreateRequest={canCreateRequest}
        canRequestAppChange={canRequestAppChange}
        setShowForm={setShowForm}
        setShowAppRequestModal={setShowAppRequestModal}
        setShowAppRequestSidebar={setShowAppRequestSidebar}
        appConfig={appConfig}
        isDark={isDark}
        toggleDark={toggleDark}
        onOpenProfile={openProfile}
        onOpenHelp={() => setShowHelp(true)}
        onOpenMyRequests={currentUser ? () => setShowMyRequests(true) : undefined}
        notifications={notifications}
        unreadCount={unreadCount}
        markRead={markRead}
        markAllRead={markAllRead}
        notifOpen={notifOpen}
        setNotifOpen={setNotifOpen}
        onNotifNavigate={handleNotifNavigate}
      />

      {/* PLAN VIEW TOOLBAR — pills + view toggle, shown for both table and corridor sub-views */}
      {view === "table" && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 28px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap', background: 'var(--bg-surface)' }}>
          {/* Quick-filter pills */}
          {([
            { key: 'all',              label: 'All Plans',        emoji: '📋', activeColor: '#1E293B', activeBg: '#F1F5F9' },
            { key: 'my_plans',         label: 'My Plans',         emoji: '👤', activeColor: '#1D4ED8', activeBg: '#DBEAFE' },
            { key: 'at_risk',          label: 'At Risk',          emoji: '⚠️', activeColor: '#D97706', activeBg: '#FEF3C7' },
            { key: 'needs_compliance', label: 'Needs Compliance', emoji: '🏛', activeColor: '#7C3AED', activeBg: '#EDE9FE' },
            { key: 'overdue_dot',      label: 'Overdue at DOT',   emoji: '🕐', activeColor: '#DC2626', activeBg: '#FEE2E2' },
          ] as { key: FilterState['quickFilter']; label: string; emoji: string; activeColor: string; activeBg: string }[]).map(p => {
            const active = (filter.quickFilter ?? 'all') === p.key;
            const btn = (
              <button
                key={p.key}
                onClick={() => setFilter(pr => ({ ...pr, quickFilter: p.key }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 999,
                  border: active ? `1.5px solid ${p.activeColor}40` : '1.5px solid var(--border)',
                  background: active ? p.activeBg : 'var(--bg-surface)',
                  color: active ? p.activeColor : 'var(--text-muted)',
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: 'pointer', transition: 'all .15s',
                  fontFamily: font,
                }}
              >
                <span style={{ fontSize: 13 }}>{p.emoji}</span>
                {p.label}
              </button>
            );
            if (p.key === 'my_plans') {
              return (
                <Tooltip key={p.key} text="Your active work queue — plans you lead or follow. Cancelled, expired, and closed plans are excluded." position="bottom">
                  {btn}
                </Tooltip>
              );
            }
            return btn;
          })}

          {/* Option B — My Plans subtext strip */}
          {filter.quickFilter === 'my_plans' && (() => {
            const userName = currentUser?.name || '';
            const firstName = userName.split(' ')[0];
            const userEmail = currentUser?.email || '';
            const leadCount = filtered.filter(p => p.lead === userName || p.lead === firstName).length;
            const followCount = filtered.filter(p =>
              userEmail && (p.subscribers ?? []).includes(userEmail) &&
              p.lead !== userName && p.lead !== firstName
            ).length;
            return (
              <div style={{ width: '100%', fontSize: 11, color: '#64748B', paddingTop: 4, paddingLeft: 2 }}>
                Showing active plans only
                <span style={{ color: '#94A3B8', margin: '0 6px' }}>·</span>
                <span style={{ color: '#1D4ED8', fontWeight: 600 }}>{leadCount} leading</span>
                <span style={{ color: '#94A3B8', margin: '0 6px' }}>·</span>
                <span style={{ color: '#0891B2', fontWeight: 600 }}>{followCount} following</span>
              </div>
            );
          })()}

        </div>
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
            currentUserEmail={currentUser?.email}
            notificationEmail={currentUser?.notificationEmail}
          />
        )}

        {/* APP FEEDBACK VIEW */}
        {view === "app_feedback" && canManageApp && (
          <AppFeedbackView
            appRequests={appRequests}
            searchQuery={searchQuery}
            deletingRequestId={deletingRequestId}
            setDeletingRequestId={setDeletingRequestId}
            appRequestTab={appRequestTab}
            setAppRequestTab={setAppRequestTab}
            setPreviewImage={setPreviewImage}
            appTodos={appTodos}
            newTodoText={newTodoText}
            setNewTodoText={setNewTodoText}
            todoCompletedExpanded={todoCompletedExpanded}
            setTodoCompletedExpanded={setTodoCompletedExpanded}
            setShowTodoSidebar={setShowTodoSidebar}
            currentUserEmail={currentUser?.email ?? ''}
            currentUserName={currentUser?.displayName || currentUser?.email || ''}
          />
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
            libraryVariances={libraryVariances}
            setView={setView}
          />
        )}

        {/* METRICS VIEW */}
        {view==="metrics"&&(
          <MetricsView
            filtered={filtered}
            allPlans={plans}
            globalLogs={globalLogs}
            metrics={metrics}
            monoFont={monoFont}
            TODAY={TODAY}
            setSelectedPlan={setSelectedPlan}
            setView={setView}
            setFilter={setFilter}
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
            globalLogs={globalLogs}
            setSelectedPlan={setSelectedPlan}
            setView={setView}
            monoFont={monoFont}
          />
        )}

        {/* CORRIDOR MAP — standalone nav view */}
        {view === "corridor" && (
          <CorridorMapView plans={filtered} setSelectedPlan={setSelectedPlan} monoFont={monoFont} />
        )}

        {/* COMPLIANCE VIEW */}
        {view==="compliance" && canViewCompliance && (
          <ComplianceView
            plans={searchFiltered}
            setSelectedPlan={setSelectedPlan}
            setView={setView}
            appConfig={appConfig}
          />
        )}

        {/* VARIANCE LIBRARY */}
        {view === "variances" && canViewTab('variances') && (
          <VarianceLibraryView currentUser={currentUser} appConfig={appConfig} plans={searchFiltered} setSelectedPlan={setSelectedPlan} />
        )}

        {/* CR HUB */}
        {view === "cr_hub" && canViewCRHub && (
          <CRHubView
            currentUser={currentUser}
            appConfig={appConfig}
            plans={searchFiltered}
            setSelectedPlan={setSelectedPlan}
            setView={setView}
          />
        )}

        {/* REFERENCE */}
        {view === 'reference' && canViewTab('reference') && (
          <ReferenceView
            role={role}
            uploadedBy={currentUser?.displayName || currentUser?.email || 'Unknown'}
          />
        )}

        {/* TIMELINE (GANTT) VIEW */}
        {view === "timeline" && canViewTab('timeline') && (
          <GanttView
            plans={filtered}
            monoFont={monoFont}
            setSelectedPlan={setSelectedPlan}
          />
        )}

        {/* REPORTS VIEW */}
        {view === "reports" && canViewTab('reports') && (
          <ReportsView
            plans={plans}
            filtered={filtered}
            currentUser={currentUser}
            monoFont={monoFont}
            setSelectedPlan={setSelectedPlan}
            setView={setView}
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
            canReorder={role === UserRole.MOT || role === UserRole.ADMIN}
            currentUser={currentUser}
            allUsers={users}
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
        {view==="table" && (
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
            exportToExcel={exportToExcel}
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
            libraryVariances={libraryVariances}
          />
        )}






      </div>

      {/* APP REQUEST MODAL */}
      {showMyRequests && currentUser && (
        <MyRequestsModal currentUser={currentUser} onClose={() => setShowMyRequests(false)} />
      )}

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
        onNavigateToPlan={(locId) => {
          const plan = plans.find(p => (p.loc || p.id) === locId);
          if (plan) { setSelectedPlan(plan); resetForm(); }
        }}
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

        </>
      )}
      </div>
      {previewImage && ReactDOM.createPortal(
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
            zIndex: 9999,
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
        </div>,
        document.body
      )}
      <ToastContainer />
      {showWelcomeScreen && currentUser && (
        <WelcomeScreen
          user={currentUser}
          onComplete={async (data) => {
            await authService.saveUserProfile(currentUser.email, data);
            setCurrentUser({ ...currentUser, name: data.displayName, displayName: data.displayName, title: data.title, notificationEmail: data.notificationEmail });
          }}
        />
      )}
      {profileModalOpen && currentUser && (
        <ProfileModal
          user={currentUser}
          initialTab={profileModalTab}
          onClose={() => setProfileModalOpen(false)}
          onSaved={(updated) => setCurrentUser({ ...currentUser, ...updated })}
        />
      )}

      {showHelp && (
        <HelpModal
          currentUser={currentUser}
          onClose={() => setShowHelp(false)}
        />
      )}
    </>
    </AppListsProvider>
  )
}

