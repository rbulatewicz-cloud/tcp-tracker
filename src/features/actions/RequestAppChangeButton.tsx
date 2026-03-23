import React from 'react';

interface RequestAppChangeButtonProps {
  canRequestAppChange: boolean;
  onClick: () => void;
}

export const RequestAppChangeButton: React.FC<RequestAppChangeButtonProps> = ({ canRequestAppChange, onClick }) => {
  if (!canRequestAppChange) return null;

  const font = "'Outfit', sans-serif";

  return (
    <button 
      onClick={onClick} 
      style={{
        background: "#6366F1",
        color: "#fff",
        border: "none",
        padding: "8px 18px",
        borderRadius: 8,
        fontWeight: 600,
        cursor: "pointer",
        fontSize: 12,
        fontFamily: font,
        display: "flex",
        alignItems: "center",
        gap: 6
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
      Request App Change
    </button>
  );
};
