import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { authApi } from '../api/endpoints.js';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
      setError('Password must be at least 8 characters with a letter and a number.');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.message || 'This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface px-4">
        <div className="text-center">
          <p className="text-critical font-semibold mb-4">Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="text-series-1 font-bold hover:underline">Request a new reset link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-11 h-11 bg-series-1 rounded-xl flex items-center justify-center text-white shadow-lg">
            <ShieldCheck size={24} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-ink">ResolveX</h1>
        </div>

        <div className="bg-plane border border-line rounded-2xl p-8 shadow-sm">
          {done ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-good/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-good" />
              </div>
              <h2 className="text-xl font-bold text-ink mb-2">Password updated!</h2>
              <p className="text-ink-secondary text-sm">Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-ink mb-1">Set a new password</h2>
              <p className="text-ink-secondary text-sm mb-6">Choose a strong password for your ResolveX account.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
                <div className="group">
                  <label className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2 transition-colors group-focus-within:text-series-1">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      className="w-full bg-surface border border-line rounded-xl px-5 py-4 pr-12 text-ink font-medium shadow-sm focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20 transition-all placeholder:text-ink-muted/50"
                      placeholder="Min 8 chars, 1 letter, 1 number"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors">
                      {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="group">
                  <label className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2 transition-colors group-focus-within:text-series-1">
                    Confirm Password
                  </label>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    className="w-full bg-surface border border-line rounded-xl px-5 py-4 text-ink font-medium shadow-sm focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20 transition-all placeholder:text-ink-muted/50"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>

                {error && (
                  <div role="alert" className="flex items-center gap-3 bg-critical/10 border border-critical/20 px-4 py-3 rounded-lg">
                    <div className="w-1.5 h-6 rounded-full bg-critical" />
                    <p className="text-sm text-critical font-semibold">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !password || !confirm}
                  className="w-full bg-series-1 hover:brightness-110 text-white font-bold text-base py-4 rounded-xl transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
