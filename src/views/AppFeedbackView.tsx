import React from 'react';
import { db } from '../firebase';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { TodoSidebar } from '../components/TodoSidebar';
import { MONO_FONT as monoFont } from '../constants';

interface AppFeedbackViewProps {
  appRequests: any[];
  searchQuery: string;
  deletingRequestId: string | null;
  setDeletingRequestId: (id: string | null) => void;
  appRequestTab: 'pending' | 'completed';
  setAppRequestTab: (tab: 'pending' | 'completed') => void;
  setPreviewImage: (url: string | null) => void;
  appTodos: any[];
  newTodoText: string;
  setNewTodoText: (text: string) => void;
  todoCompletedExpanded: boolean;
  setTodoCompletedExpanded: (v: boolean) => void;
  setShowTodoSidebar: (v: boolean) => void;
}

export const AppFeedbackView: React.FC<AppFeedbackViewProps> = ({
  appRequests,
  searchQuery,
  deletingRequestId,
  setDeletingRequestId,
  appRequestTab,
  setAppRequestTab,
  setPreviewImage,
  appTodos,
  newTodoText,
  setNewTodoText,
  todoCompletedExpanded,
  setTodoCompletedExpanded,
  setShowTodoSidebar,
}) => {
  const filteredRequests = appRequests.filter(r =>
    r.status === appRequestTab &&
    (!searchQuery ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.id && r.id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.userName && r.userName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.userEmail && r.userEmail.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div style={{ padding: "20px 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 32, alignItems: "start" }}>

        {/* Left Column: App Requests */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginBottom: 16 }}>App Change Requests</h2>
              <div style={{ display: "flex", gap: 16 }}>
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
            <div style={{ fontSize: 13, color: "#64748B", fontWeight: 500, marginBottom: 8 }}>{appRequests.length} Total Requests</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 24 }}>
            {filteredRequests.map(req => (
              <div key={req.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", padding: 24, display: "flex", flexDirection: "column", gap: 20, position: "relative", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#1E293B", marginBottom: 4, letterSpacing: "-0.01em" }}>{req.id}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: monoFont }}>{new Date(req.createdAt).toLocaleString()}</div>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ background: req.status === "pending" ? "#F59E0B" : "#10B981", color: "#fff", padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{req.status}</div>

                    {deletingRequestId === req.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FEF2F2", padding: "4px 8px", borderRadius: 8, border: "1px solid #FEE2E2" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#991B1B" }}>Delete?</span>
                        <button onClick={() => setDeletingRequestId(null)} style={{ fontSize: 10, color: "#64748B", border: "none", background: "transparent", cursor: "pointer", fontWeight: 600 }}>No</button>
                        <button onClick={async () => {
                          try {
                            await deleteDoc(doc(db, 'app_feedback', req.id));
                            setDeletingRequestId(null);
                          } catch (err) {
                            console.error("Delete failed:", err);
                            setDeletingRequestId(null);
                          }
                        }} style={{ fontSize: 10, color: "#EF4444", border: "none", background: "transparent", cursor: "pointer", fontWeight: 800 }}>Yes</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingRequestId(req.id)}
                        style={{ background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer", padding: 4, transition: "color 0.2s" }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "#EF4444"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "#94A3B8"}
                        title="Delete Request"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, whiteSpace: "pre-wrap", fontWeight: 500 }}>{req.description}</div>
                <div style={{ fontSize: 12, color: "#64748B" }}>By: <span style={{ fontWeight: 700, color: "#475569" }}>{req.userName}</span> <span style={{ opacity: 0.6 }}>({req.userEmail})</span></div>

                {(req.screenshot || (req.files && req.files.length > 0)) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Attached Files & Screenshots</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 16 }}>
                      {req.screenshot && (
                        <div
                          style={{ aspectRatio: "1/1", borderRadius: 12, overflow: "hidden", border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "zoom-in", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", position: "relative" }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0,0,0,0.1)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.1)"; }}
                          onClick={() => setPreviewImage(req.screenshot)}
                        >
                          <img src={req.screenshot} alt="Legacy Screenshot" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} referrerPolicy="no-referrer" />
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)", opacity: 0, transition: "opacity 0.2s", display: "flex", alignItems: "flex-end", padding: 8 }} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0"}>
                            <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>VIEW SCREENSHOT</span>
                          </div>
                        </div>
                      )}
                      {req.files && req.files.map((f: string, i: number) => {
                        const isImage = (f as string).startsWith("data:image/") || /\.(jpeg|jpg|gif|png|webp|svg)(\?|$)/i.test(f as string);
                        return (
                          <div key={i}
                            style={{ aspectRatio: "1/1", borderRadius: 12, overflow: "hidden", border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", position: "relative" }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0,0,0,0.1)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.1)"; }}
                            onClick={() => isImage ? setPreviewImage(f) : window.open(f)}
                          >
                            {isImage ? (
                              <>
                                <img src={f} alt={`Attachment ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} referrerPolicy="no-referrer" />
                                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)", opacity: 0, transition: "opacity 0.2s", display: "flex", alignItems: "flex-end", padding: 8 }} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0"}>
                                  <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>VIEW IMAGE</span>
                                </div>
                              </>
                            ) : (
                              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#64748B", padding: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366F1" }}>
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>File {i + 1}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: "auto", paddingTop: 20, borderTop: "1px solid #F1F5F9", display: "flex", gap: 12 }}>
                  <button onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'app_feedback', req.id), { status: req.status === "pending" ? "completed" : "pending" });
                    } catch (err) {
                      console.error("Update failed:", err);
                    }
                  }} style={{ flex: 1, background: req.status === "pending" ? "#10B981" : "#F1F5F9", color: req.status === "pending" ? "#fff" : "#475569", border: "none", padding: "10px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                    {req.status === "pending" ? "Mark as Completed" : "Move back to Pending"}
                  </button>
                </div>
              </div>
            ))}
            {filteredRequests.length === 0 && (
              <div style={{ gridColumn: "1/-1", padding: 80, textAlign: "center", background: "#fff", borderRadius: 16, border: "1px dashed #CBD5E1", color: "#94A3B8", fontWeight: 500 }}>
                No {appRequestTab} requests
              </div>
            )}
          </div>
        </div>

        {/* Right Column: To-Do List */}
        <div style={{ background: "#F8FAFC", borderRadius: 16, padding: 24, border: "1px solid #E2E8F0", position: "sticky", top: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", height: "calc(100vh - 120px)" }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#6366F1" }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
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
  );
};
