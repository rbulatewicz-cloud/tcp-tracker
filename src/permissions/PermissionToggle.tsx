import React, { useState, useRef, useEffect } from 'react';
import { Eye, Edit2 } from 'lucide-react';

export const PermissionToggle = ({
  fieldName,
  allowedEditRoles,
  allowedViewRoles,
  onToggleEdit,
  onToggleView
}: {
  fieldName: string,
  allowedEditRoles: string[],
  allowedViewRoles: string[],
  onToggleEdit: (role: string) => void,
  onToggleView: (role: string) => void
}) => {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const roles = ["GUEST", "SFTC", "MOT", "CR"];

  useEffect(() => {
    if (!show) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <Eye size={12} color={allowedViewRoles.length > 0 ? "#3B82F6" : "#94A3B8"} />
        <Edit2 size={12} color={allowedEditRoles.length > 0 ? "#10B981" : "#94A3B8"} />
      </button>
      {show && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 8, zIndex: 1000, width: 180, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 8, borderBottom: '1px solid #F1F5F9', paddingBottom: 4 }}>{fieldName}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 9, fontWeight: 700, color: '#64748B', marginBottom: 4 }}>
            <span>Role</span>
            <span style={{textAlign: 'center'}}>View</span>
            <span style={{textAlign: 'center'}}>Edit</span>
          </div>
          {roles.map(role => (
            <div key={role} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{role}</span>
              <button
                onClick={() => onToggleView(role)}
                style={{
                  padding: '2px',
                  borderRadius: 4,
                  background: allowedViewRoles.includes(role) ? '#3B82F6' : '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                  display: 'flex', justifyContent: 'center'
                }}
              >
                <Eye size={10} color={allowedViewRoles.includes(role) ? '#fff' : '#CBD5E1'} />
              </button>
              <button
                onClick={() => onToggleEdit(role)}
                style={{
                  padding: '2px',
                  borderRadius: 4,
                  background: allowedEditRoles.includes(role) ? '#10B981' : '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                  display: 'flex', justifyContent: 'center'
                }}
              >
                <Edit2 size={10} color={allowedEditRoles.includes(role) ? '#fff' : '#CBD5E1'} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
