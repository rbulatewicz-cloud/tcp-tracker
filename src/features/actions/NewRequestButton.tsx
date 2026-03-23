import React from 'react';

interface NewRequestButtonProps {
  canCreateRequest: boolean;
  onClick: () => void;
}

export const NewRequestButton: React.FC<NewRequestButtonProps> = ({ canCreateRequest, onClick }) => {
  if (!canCreateRequest) return null;

  const font = "'Outfit', sans-serif";

  return (
    <button 
      onClick={onClick} 
      style={{
        background: "#0F172A",
        color: "#fff",
        border: "none",
        padding: "8px 18px",
        borderRadius: 8,
        fontWeight: 600,
        cursor: "pointer",
        fontSize: 12,
        fontFamily: font
      }}
    >
      + New Request
    </button>
  );
};
