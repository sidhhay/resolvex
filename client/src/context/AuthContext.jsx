/**
 * Authentication context.
 *
 * Owns the JWT and the current user. The token is persisted so a refresh does
 * not sign you out, but the *user* is always re-fetched from `/auth/me` on
 * mount rather than restored from storage — a token whose account was
 * deactivated or whose role changed must not keep working from a cached copy.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/endpoints.js';
import { getToken, setToken, setUnauthorizedHandler } from '../api/client.js';

/**
 * @typedef {Object} SessionUser
 * @property {number} id
 * @property {string} name
 * @property {string} email
 * @property {'student' | 'handler' | 'admin'} role
 * @property {number | null} departmentId
 * @property {string | null} [departmentName]
 */

/**
 * @typedef {Object} AuthValue
 * @property {SessionUser | null} user
 * @property {boolean} initialising  True until the stored token has been checked.
 * @property {boolean} isAuthenticated
 * @property {(email: string, password: string) => Promise<SessionUser>} login
 * @property {(input: { name: string, email: string, password: string }) => Promise<void>} register
 * @property {(email: string, code: string) => Promise<SessionUser>} verifyRegistration
 * @property {() => void} logout
 * @property {(...roles: string[]) => boolean} hasRole
 */

const AuthContext = createContext(/** @type {AuthValue | null} */ (null));

/** @param {{ children: React.ReactNode }} props */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(/** @type {SessionUser | null} */ (null));
  const [initialising, setInitialising] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // A 401 from any request anywhere tears the session down exactly once.
  useEffect(() => {
    setUnauthorizedHandler(() => logout());
  }, [logout]);

  // Restore the session on first paint.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setInitialising(false);
      return;
    }
    authApi.me()
      .then((data) => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setInitialising(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  /** Used by OTP login: the server returns a token+user directly. */
  const loginWithToken = useCallback((token, userData) => {
    setToken(token);
    setUser(userData);
  }, []);

  const register = useCallback(async (input) => {
    await authApi.register(input);
  }, []);

  const verifyRegistration = useCallback(async (email, code) => {
    const data = await authApi.verifyRegistration(email, code);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const hasRole = useCallback(
    (...roles) => Boolean(user && (roles.length === 0 || roles.includes(user.role))),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      initialising,
      isAuthenticated: Boolean(user),
      login,
      loginWithToken,
      register,
      logout,
      hasRole,
    }),
    [user, initialising, login, loginWithToken, register, verifyRegistration, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** @returns {AuthValue} */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
