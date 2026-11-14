/**
 * Light / dark theme.
 *
 * Three states: an explicit 'light' or 'dark' choice stamps `data-theme` on the
 * root element and wins over the OS; 'system' removes the attribute and lets
 * `prefers-color-scheme` decide. index.html applies the stored value before
 * first paint so a reload never flashes the wrong theme.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'resolvex.theme';

/** @typedef {'light' | 'dark' | 'system'} ThemeChoice */

const ThemeContext = createContext(
  /** @type {{ theme: ThemeChoice, setTheme: (t: ThemeChoice) => void, cycle: () => void } | null} */ (null),
);

/** @returns {ThemeChoice} */
function readStored() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** @param {{ children: React.ReactNode }} props */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;

    try {
      if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage blocked; the in-memory choice still applies for this session */
    }
  }, [theme]);

  const setTheme = useCallback((next) => setThemeState(next), []);
  const cycle = useCallback(() => {
    setThemeState((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'));
  }, []);

  const value = useMemo(() => ({ theme, setTheme, cycle }), [theme, setTheme, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
