import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Mail } from 'lucide-react';
import { authApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { homePathFor } from '../components/ProtectedRoute.jsx';

export function OtpLoginPage() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequestOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.requestOtp(email);
      setStep('code');
    } catch (err) {
      setError(err.message || 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await authApi.verifyOtp(email, code);
      loginWithToken(token, user);
      navigate(homePathFor(user.role), { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
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
          {step === 'email' ? (
            <>
              <div className="w-12 h-12 bg-series-1/10 rounded-xl flex items-center justify-center mb-4">
                <Mail size={22} className="text-series-1" />
              </div>
              <h2 className="text-2xl font-bold text-ink mb-1">Sign in with a code</h2>
              <p className="text-ink-secondary text-sm mb-6">
                We'll email you a 6-digit code. No password needed.
              </p>

              <form onSubmit={handleRequestOtp} className="flex flex-col gap-5" noValidate>
                <div className="group">
                  <label htmlFor="otp-email" className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2 transition-colors group-focus-within:text-series-1">
                    University Email
                  </label>
                  <input
                    id="otp-email"
                    type="email"
                    required
                    autoComplete="email"
                    className="w-full bg-surface border border-line rounded-xl px-5 py-4 text-ink font-medium shadow-sm focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20 transition-all placeholder:text-ink-muted/50"
                    placeholder="student@resolvex.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  disabled={loading || !email}
                  className="w-full bg-series-1 hover:brightness-110 text-white font-bold text-base py-4 rounded-xl transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
                >
                  {loading ? 'Sending code...' : 'Send Code'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="w-12 h-12 bg-good/10 rounded-xl flex items-center justify-center mb-4">
                <Mail size={22} className="text-good" />
              </div>
              <h2 className="text-2xl font-bold text-ink mb-1">Enter your code</h2>
              <p className="text-ink-secondary text-sm mb-1">
                We sent a 6-digit code to
              </p>
              <p className="text-ink font-semibold text-sm mb-6">{email}</p>

              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5" noValidate>
                <div className="group">
                  <label htmlFor="otp-code" className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2 transition-colors group-focus-within:text-series-1">
                    6-Digit Code
                  </label>
                  <input
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    autoComplete="one-time-code"
                    className="w-full bg-surface border border-line rounded-xl px-5 py-4 text-ink font-mono text-2xl tracking-[0.5em] font-bold text-center shadow-sm focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20 transition-all placeholder:text-ink-muted/50 placeholder:tracking-normal placeholder:text-sm placeholder:font-normal"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                  disabled={loading || code.length !== 6}
                  className="w-full bg-series-1 hover:brightness-110 text-white font-bold text-base py-4 rounded-xl transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
                >
                  {loading ? 'Verifying...' : 'Sign In'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setError(''); }}
                  className="text-sm text-center text-ink-secondary hover:text-ink transition-colors"
                >
                  Use a different email or resend
                </button>
              </form>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-line">
            <Link to="/login" className="flex items-center gap-2 text-sm font-semibold text-ink-secondary hover:text-series-1 transition-colors">
              <ArrowLeft size={16} />
              Sign in with password instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
