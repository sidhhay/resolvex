/**
 * Route table.
 *
 * Providers nest outside the router so context survives navigation:
 *   Theme → Toast → Auth → Socket → Routes
 * Socket sits inside Auth because it only connects once there is a session.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AppLayout } from './components/AppLayout.jsx';
import { ProtectedRoute, homePathFor } from './components/ProtectedRoute.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { MyComplaintsPage } from './pages/student/MyComplaintsPage.jsx';
import { NewComplaintPage } from './pages/student/NewComplaintPage.jsx';
import { ComplaintDetailPage } from './pages/student/ComplaintDetailPage.jsx';
import { HandlerDashboard } from './pages/handler/HandlerDashboard.jsx';
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage.jsx';
import { UserManagementPage } from './pages/admin/UserManagementPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

/** Sends "/" to whichever screen is useful for the caller's role. */
function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user?.role)} replace />;
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <BrowserRouter>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                {/* Everything below requires a session. */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<RoleHome />} />

                    {/* Citizen portal — open to every role, since staff file
                        complaints too. Row-level access is enforced by the API. */}
                    <Route path="/complaints" element={<MyComplaintsPage />} />
                    <Route path="/complaints/new" element={<NewComplaintPage />} />
                    <Route path="/complaints/:id" element={<ComplaintDetailPage />} />

                    {/* Staff only. */}
                    <Route element={<ProtectedRoute roles={['handler', 'admin']} />}>
                      <Route path="/dashboard" element={<HandlerDashboard />} />
                    </Route>

                    {/* Administrators only. */}
                    <Route element={<ProtectedRoute roles={['admin']} />}>
                      <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
                      <Route path="/admin/users" element={<UserManagementPage />} />
                    </Route>

                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
