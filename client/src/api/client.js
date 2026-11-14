/**
 * Axios instance shared by the whole app.
 *
 * Responsibilities kept here so no component ever deals with them:
 *  • attach the bearer token to every request,
 *  • unwrap the API's `{ error: { code, message, details } }` envelope into a
 *    real Error with `.code` and `.details`, so callers can `catch (e)` and
 *    render `e.message` directly,
 *  • sign the user out on a 401 rather than leaving a dead session on screen.
 */
import axios from 'axios';

const TOKEN_KEY = 'resolvex.token';

/** @returns {string | null} */
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing / blocked storage: fall back to a session-only token.
    return memoryToken;
  }
}

/** @type {string | null} */
let memoryToken = null;

/** @param {string | null} token */
export function setToken(token) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* memoryToken already holds it */
  }
}

/** @type {(() => void) | null} */
let onUnauthorized = null;

/** Registered once by AuthProvider. @param {() => void} handler */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api`,
  timeout: 20_000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const payload = error.response?.data?.error;

    if (status === 401) {
      // Expired or revoked. Clearing here means every screen reacts at once.
      setToken(null);
      onUnauthorized?.();
    }

    const normalised = new Error(
      payload?.message ??
        (error.code === 'ECONNABORTED'
          ? 'The server took too long to respond. Please try again.'
          : 'Could not reach the server. Check your connection and try again.'),
    );
    // @ts-expect-error — augmenting Error with API context for callers.
    normalised.code = payload?.code ?? error.code ?? 'NETWORK_ERROR';
    // @ts-expect-error
    normalised.details = payload?.details ?? null;
    // @ts-expect-error
    normalised.status = status ?? 0;
    return Promise.reject(normalised);
  },
);
