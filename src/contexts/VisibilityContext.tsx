import { createContext, useContext, ReactNode } from 'react';
import { useUserSettings } from '../app/hooks/useUserSettings';

interface VisibilityContextType {
  isVisible: boolean;
  toggleVisibility: () => void;
}

const VisibilityContext = createContext<VisibilityContextType>({
  isVisible: false,
  toggleVisibility: () => { },
});

export function VisibilityProvider({ children }: { children: ReactNode }) {
  const { prefs, update } = useUserSettings();
  const toggleVisibility = () => update({ showSensitiveInfo: !prefs.showSensitiveInfo });

  return (
    <VisibilityContext.Provider value={{ isVisible: prefs.showSensitiveInfo, toggleVisibility }}>
      {children}
    </VisibilityContext.Provider>
  );
}

export function useVisibility() {
  return useContext(VisibilityContext);
}
