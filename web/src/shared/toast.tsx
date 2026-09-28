import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

interface ToastState {
  message: string;
  duration: number;
}

interface ToastContextValue {
  showToast(message: string, duration?: number): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, duration = 3200) => {
    setToast({ message, duration });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), toast.duration);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className={`toast-region${toast ? " is-visible" : ""}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toast?.message ?? ""}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context.showToast;
}
