import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { ToastItem, dismissToast, subscribeToasts } from '../lib/toast';

const ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  info:    Info,
  warning: AlertTriangle,
  loading: Loader2,
};

const COLORS = {
  success: { bg: '#F0FDF4', border: '#86EFAC', text: '#166534', icon: '#22C55E' },
  error:   { bg: '#FEF2F2', border: '#FCA5A5', text: '#991B1B', icon: '#EF4444' },
  info:    { bg: '#EFF6FF', border: '#93C5FD', text: '#1E40AF', icon: '#3B82F6' },
  warning: { bg: '#FFFBEB', border: '#FCD34D', text: '#92400E', icon: '#F59E0B' },
  loading: { bg: '#F8FAFC', border: '#CBD5E1', text: '#334155', icon: '#64748B' },
};

const Toast: React.FC<{ toast: ToastItem }> = ({ toast }) => {
  const [visible, setVisible] = useState(false);
  const Icon = ICONS[toast.type];
  const c = COLORS[toast.type];

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 10,
      padding: '12px 14px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      minWidth: 280,
      maxWidth: 400,
      transform: visible ? 'translateX(0)' : 'translateX(120%)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s',
      pointerEvents: 'all',
    }}>
      <Icon
        size={16}
        style={{ color: c.icon, flexShrink: 0, marginTop: 1 }}
        className={toast.type === 'loading' ? 'animate-spin' : undefined}
      />
      <span style={{ fontSize: 13, fontWeight: 500, color: c.text, flex: 1, lineHeight: 1.4 }}>
        {toast.message}
      </span>
      {/* Only show dismiss button for non-loading toasts */}
      {toast.type !== 'loading' && (
        <button
          onClick={() => dismissToast(toast.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text, opacity: 0.5, padding: 0, flexShrink: 0, display: 'flex' }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 9999,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => <Toast key={t.id} toast={t} />)}
    </div>
  );
};
