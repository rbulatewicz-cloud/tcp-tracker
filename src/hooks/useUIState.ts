import { useState } from 'react';
import { LoadingState } from '../types';

export const useUIState = () => {
  const [view, setView] = useState("table");
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAppRequestModal, setShowAppRequestModal] = useState(false);
  const [showAppRequestSidebar, setShowAppRequestSidebar] = useState(false);
  const [showNeedByWarningModal, setShowNeedByWarningModal] = useState(false);
  const [showMyRequests, setShowMyRequests] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [showTodoSidebar, setShowTodoSidebar] = useState(false);
  const [todoCompletedExpanded, setTodoCompletedExpanded] = useState(false);
  const [hoveredPlanId, setHoveredPlanId] = useState<string | null>(null);
  const [hoveredMetricIndex, setHoveredMetricIndex] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [isPermissionEditingMode, setIsPermissionEditingMode] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showLOCForm, setShowLOCForm] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<{ show: boolean, pos: number, id: string }>({ show: false, pos: 0, id: "" });
  const [clearLogConfirm, setClearLogConfirm] = useState({ isOpen: false, type: 'global' as 'global' | 'plan', planId: null as string | null });
  const [clearPlansConfirm, setClearPlansConfirm] = useState(false);
  const [loading, setLoading] = useState<LoadingState>({
    export: false,
    bulk: false,
    upload: false,
    submit: false,
    appRequest: false
  });

  return {
    view, setView,
    showAdminMenu, setShowAdminMenu,
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
    showUserForm, setShowUserForm,
    showLOCForm, setShowLOCForm,
    submissionSuccess, setSubmissionSuccess,
    clearLogConfirm, setClearLogConfirm,
    clearPlansConfirm, setClearPlansConfirm,
    loading, setLoading
  };
};
