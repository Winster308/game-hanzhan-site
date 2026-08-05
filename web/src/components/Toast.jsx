import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const show = useCallback((message, type = 'info') => {
    setToast({ message, type });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  // 卸载时清理定时器
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <ToastContext.Provider value={{ toast, show }}>
      {children}
      {toast && <div className={`toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
