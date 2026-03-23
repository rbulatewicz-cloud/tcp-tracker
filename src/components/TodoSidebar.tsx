import React from 'react';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { showToast } from '../lib/toast';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

interface TodoSidebarProps {
  appTodos: Todo[];
  newTodoText: string;
  setNewTodoText: (text: string) => void;
  todoCompletedExpanded: boolean;
  setTodoCompletedExpanded: (expanded: boolean) => void;
  onClose: () => void;
}

const TodoSidebarComponent: React.FC<TodoSidebarProps> = ({
  appTodos,
  newTodoText,
  setNewTodoText,
  todoCompletedExpanded,
  setTodoCompletedExpanded,
  onClose
}) => {
  const activeTodos = appTodos.filter(t => !t.completed);
  const completedTodos = appTodos.filter(t => t.completed);

  return (
    <div style={{display: "flex", flexDirection: "column", height: "100%"}}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!newTodoText.trim()) return;
        const newTodo = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: newTodoText.trim(),
          completed: false,
          createdAt: new Date().toISOString()
        };
        setNewTodoText("");
        try {
          await setDoc(doc(db, 'app_todos', newTodo.id), newTodo);
        } catch (err) { console.error(err); showToast("Failed to add task. Please try again.", "error"); }
      }} style={{display: "flex", gap: 8, marginBottom: 24}}>
        <input 
          type="text" 
          value={newTodoText} 
          onChange={e => setNewTodoText(e.target.value)} 
          placeholder="Add a new task..." 
          style={{flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, outline: "none"}}
          onFocus={(e) => e.target.style.borderColor = "#6366F1"}
          onBlur={(e) => e.target.style.borderColor = "#CBD5E1"}
        />
        <button type="submit" style={{padding: "10px 16px", background: "#0F172A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", transition: "background 0.2s"}} onMouseEnter={(e) => e.currentTarget.style.background = "#1E293B"} onMouseLeave={(e) => e.currentTarget.style.background = "#0F172A"}>Add</button>
      </form>

      <div style={{display: "flex", flexDirection: "column", gap: 12, flex: 1, overflowY: "auto", paddingRight: 4}}>
        {activeTodos.map(todo => (
          <div key={todo.id} style={{display: "flex", alignItems: "center", gap: 12, background: "#fff", padding: "12px 16px", borderRadius: 10, border: "1px solid #E2E8F0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)"}}>
            <input 
              type="checkbox" 
              checked={todo.completed} 
              onChange={async () => {
                try {
                  await updateDoc(doc(db, 'app_todos', todo.id), { completed: !todo.completed });
                } catch (err) { console.error(err); showToast("Failed to update task. Please try again.", "error"); }
              }}
              style={{width: 18, height: 18, cursor: "pointer", accentColor: "#6366F1"}}
            />
            <span style={{flex: 1, fontSize: 14, color: "#334155", fontWeight: 500}}>
              {todo.text}
            </span>
            <button 
              onClick={async () => {
                try {
                  await deleteDoc(doc(db, 'app_todos', todo.id));
                } catch (err) { console.error(err); showToast("Failed to delete task. Please try again.", "error"); }
              }}
              style={{background: "transparent", border: "none", color: "#CBD5E1", cursor: "pointer", padding: 4, transition: "color 0.2s"}}
              onMouseEnter={(e) => e.currentTarget.style.color = "#EF4444"}
              onMouseLeave={(e) => e.currentTarget.style.color = "#CBD5E1"}
              title="Delete Task"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        ))}
        {activeTodos.length === 0 && (
          <div style={{textAlign: "center", padding: 32, color: "#94A3B8", fontSize: 13, fontWeight: 500}}>No active tasks. Add one above!</div>
        )}

        {completedTodos.length > 0 && (
          <div style={{marginTop: 16}}>
            <button 
              onClick={() => setTodoCompletedExpanded(!todoCompletedExpanded)}
              style={{display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px 0"}}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform: todoCompletedExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s"}}><polyline points="9 18 15 12 9 6"></polyline></svg>
              Completed ({completedTodos.length})
            </button>
            
            {todoCompletedExpanded && (
              <div style={{display: "flex", flexDirection: "column", gap: 8, marginTop: 8}}>
                {completedTodos.map(todo => (
                  <div key={todo.id} style={{display: "flex", alignItems: "center", gap: 12, background: "#F8FAFC", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0", opacity: 0.7}}>
                    <input 
                      type="checkbox" 
                      checked={todo.completed} 
                      onChange={async () => {
                        try {
                          await updateDoc(doc(db, 'app_todos', todo.id), { completed: !todo.completed });
                        } catch (err) { console.error(err); showToast("Failed to update task. Please try again.", "error"); }
                      }}
                      style={{width: 16, height: 16, cursor: "pointer", accentColor: "#6366F1"}}
                    />
                    <span style={{flex: 1, fontSize: 13, color: "#94A3B8", textDecoration: "line-through", fontWeight: 500}}>
                      {todo.text}
                    </span>
                    <button 
                      onClick={async () => {
                        try {
                          await deleteDoc(doc(db, 'app_todos', todo.id));
                        } catch (err) { console.error(err); showToast("Failed to delete task. Please try again.", "error"); }
                      }}
                      style={{background: "transparent", border: "none", color: "#CBD5E1", cursor: "pointer", padding: 4}}
                      onMouseEnter={(e) => e.currentTarget.style.color = "#EF4444"}
                      onMouseLeave={(e) => e.currentTarget.style.color = "#CBD5E1"}
                      title="Delete Task"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const TodoSidebar = React.memo(TodoSidebarComponent);
