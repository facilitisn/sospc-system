import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

function ToastIcon({ type }) {
  if (type === "success") return <span className="toast-icon-symbol">✓</span>;
  if (type === "error") return <span className="toast-icon-symbol">✕</span>;
  if (type === "warning") return <span className="toast-icon-symbol">!</span>;
  return <span className="toast-icon-symbol">i</span>;
}

function ToastItem({ toast, onClose }) {
  return (
    <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
      <div className="toast-icon">
        <ToastIcon type={toast.type} />
      </div>

      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.message ? <div className="toast-message">{toast.message}</div> : null}
        <div className="toast-progress">
          <div
            className="toast-progress-bar"
            style={{ animationDuration: `${toast.duration}ms` }}
          />
        </div>
      </div>

      <button type="button" className="toast-close" onClick={() => onClose(toast.id)}>
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback((type = "info", message = "", title = "Aviso", duration = 3000) => {
    const toast = {
      id: crypto.randomUUID(),
      type,
      title,
      message,
      duration,
    };

    setToasts((prev) => [...prev, toast]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, duration);
  }, []);

  const value = useMemo(
    () => ({
      showToast,
      success: (message, title = "Sucesso", duration = 3000) => showToast("success", message, title, duration),
      error: (message, title = "Erro", duration = 3500) => showToast("error", message, title, duration),
      warning: (message, title = "Atenção", duration = 3200) => showToast("warning", message, title, duration),
      info: (message, title = "Informação", duration = 3000) => showToast("info", message, title, duration),
      removeToast,
    }),
    [removeToast, showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="toast-stack">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}
