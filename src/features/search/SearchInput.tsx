import React from 'react';

interface SearchInputProps {
  view: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({ view, searchQuery, setSearchQuery }) => {
  const font = "'Outfit', sans-serif";
  const inp: any = {
    background: "#F8FAFC",
    color: "#1E293B",
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    padding: "9px 12px 9px 36px",
    fontSize: 12,
    fontFamily: font,
    width: "100%",
    boxSizing: "border-box",
    outline: "none"
  };

  return (
    <div style={{ flex: 1, maxWidth: 400, margin: "0 24px", position: "relative" }}>
      <input
        type="text"
        placeholder={
          view === "users" ? "Search users by name or email..." :
          view === "app_feedback" ? "Search requests by ID, user, or description..." :
          view === "log" ? "Search logs by action, user, or LOC..." :
          "Search plans by LOC, street, lead, or status..."
        }
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={inp}
      />
      <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </div>
      {searchQuery && (
        <button
          onClick={() => setSearchQuery("")}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            color: "#94A3B8",
            cursor: "pointer",
            padding: 4
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};
