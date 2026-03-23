import React from 'react';
import { AppWindow } from 'lucide-react';

interface RequestAppChangeSideButtonProps {
  onClick: () => void;
}

export const RequestAppChangeSideButton: React.FC<RequestAppChangeSideButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        right: 0,
        top: '60%',
        transform: 'translateY(-50%)',
        background: '#3B82F6',
        color: '#fff',
        border: 'none',
        padding: '12px 8px',
        borderRadius: '8px 0 0 8px',
        cursor: 'pointer',
        zIndex: 1000,
        boxShadow: '-2px 0 5px rgba(0,0,0,0.1)'
      }}
      title="Request App Change"
    >
      <AppWindow size={20} />
    </button>
  );
};
