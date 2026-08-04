import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, show }}>
      {children}
      {toast && <div className={`toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
