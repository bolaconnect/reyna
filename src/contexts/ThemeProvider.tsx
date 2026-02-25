/**
 * ThemeProvider — applies `.dark` class to <html> based on userPrefs.theme.
 * Listening approach:
 *  - 'light' / 'dark' → set immediately
 *  - 'system'        → follow prefers-color-scheme media query
 */
import { useEffect, ReactNode } from 'react';
import { useUserSettings } from '../app/hooks/useUserSettings';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const { prefs } = useUserSettings();

    useEffect(() => {
        const html = document.documentElement;

        if (prefs.theme === 'dark') {
            html.classList.add('dark');
            return;
        }

        if (prefs.theme === 'light') {
            html.classList.remove('dark');
            return;
        }

        // system: follow OS preference
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = (e: MediaQueryListEvent | MediaQueryList) => {
            if (e.matches) html.classList.add('dark');
            else html.classList.remove('dark');
        };
        apply(mq);
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, [prefs.theme]);

    return <>{children}</>;
}
