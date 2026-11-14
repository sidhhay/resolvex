/**
 * Route guard.
 *
 * Three distinct outcomes, and the distinction matters:
 *   • still checking the stored token  → hold, do not flash the login screen
 *   • no session                       → redirect to /login, remembering where
 *                                        the user was headed
 *   • wrong role                       → 403 screen, NOT a redirect to login;
 *                                        signing in again would not help and
 *                                        the loop is a classic UX trap
 *
 * This is a convenience layer, not a security boundary: the API authorises
 * every request independently. Hiding a button never protects an endpoint.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Card, Spinner } from './ui/index.jsx';

/**
 * @param {{ roles?: Array<'student' | 'handler' | 'admin'>, children?: React.ReactNode }} props
 */
export function ProtectedRoute({ roles, children }) {
  const { user, initialising, isAuthenticated } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Restoring your session…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // `state.from` lets the login screen send the user back where they meant
    // to go, rather than dumping everyone on the landing page.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <ForbiddenScreen requiredRoles={roles} actualRole={user.role} />;
  }

  return children ? <>{children}</> : <Outlet />;
}

/**
 * @param {{ requiredRoles: string[], actualRole: string }} props
 */
function ForbiddenScreen({ requiredRoles, actualRole }) {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="max-w-md p-8 text-center">
        <ShieldX size={30} className="mx-auto text-critical" aria-hidden />
        <h1 className="mt-4 text-base font-semibold text-ink">You do not have access to this page</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          This area is for {requiredRoles.join(' and ')} accounts. You are signed in as{' '}
          <span className="font-medium text-ink">{actualRole}</span>.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => window.history.back()}>
            Go back
          </Button>
          <Button variant="ghost" onClick={logout}>
            Sign in as someone else
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * Sends each role to the screen that is actually useful to them.
 * @param {string | undefined} role
 * @returns {string}
 */
export function homePathFor(role) {
  if (role === 'admin') return '/admin/analytics';
  if (role === 'handler') return '/dashboard';
  return '/complaints';
}
