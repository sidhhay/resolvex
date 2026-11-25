import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { authApi } from '../api/endpoints.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState('email');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequestCode(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const result = await authApi.forgotPassword(email.trim().toLowerCase());
      setMessage(result.message || 'If that address is registered, a reset code has been sent.');
      setStep('verify');
    } catch (err) {
      setError(err.message || 'Could not request a reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) { setError('Enter the six-digit code from your email.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
      setError('Password must be at least 8 characters with a letter and a number.');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPasswordWithOtp(email.trim().toLowerCase(), code, password);
      setStep('done');
    } catch (err) {
      setError(err.message || 'The code is incorrect or has expired.');
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
          {step === 'done' ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-good/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-good" />
              </div>
              <h2 className="text-xl font-bold text-ink mb-2">Password updated!</h2>
              <p className="text-ink-secondary text-sm leading-relaxed mb-6">Your password has been changed. You can now sign in with your new password.</p>
              <Link to="/login" className="text-sm font-bold text-series-1 hover:underline">Back to sign in</Link>
            </div>
          ) : step === 'verify' ? (
            <>
              <h2 className="text-2xl font-bold text-ink mb-1">Verify your email</h2>
              <p className="text-ink-secondary text-sm mb-6">Enter the six-digit code sent to <span className="font-semibold text-ink">{email}</span>, then choose a new password.</p>
              {message && <p className="text-xs text-ink-secondary mb-4">{message}</p>}
              <form onSubmit={handleReset} className="flex flex-col gap-5" noValidate>
                <div>
                  <label htmlFor="code" className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2">Email verification code</label>
                  <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
                    className="w-full bg-surface border border-line rounded-xl px-5 py-4 text-ink font-medium tracking-[0.35em] focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20"
                    placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                </div>
                <div>
                  <label htmlFor="password" className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2">New password</label>
                  <input id="password" type="password" autoComplete="new-password" required
                    className="w-full bg-surface border border-line rounded-xl px-5 py-4 text-ink font-medium focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20"
                    placeholder="Min 8 chars, 1 letter, 1 number" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="confirm" className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2">Confirm new password</label>
                  <input id="confirm" type="password" autoComplete="new-password" required
                    className="w-full bg-surface border border-line rounded-xl px-5 py-4 text-ink font-medium focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20"
                    placeholder="Enter password again" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                {error && <div role="alert" className="bg-critical/10 border border-critical/20 px-4 py-3 rounded-lg"><p className="text-sm text-critical font-semibold">{error}</p></div>}
                <button type="submit" disabled={loading || code.length !== 6 || !password || !confirm}
                  className="w-full bg-series-1 hover:brightness-110 text-white font-bold text-base py-4 rounded-xl transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed">
                  {loading ? 'Updating password...' : 'Verify code & update password'}
                </button>
              </form>
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }}
                className="mt-5 text-sm font-semibold text-ink-secondary hover:text-series-1">Use a different email</button>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-ink mb-1">Forgot your password?</h2>
              <p className="text-ink-secondary text-sm mb-6">Enter your registered email and we'll send a six-digit reset code.</p>
              <form onSubmit={handleRequestCode} className="flex flex-col gap-5" noValidate>
                <div>
                  <label htmlFor="email" className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2">Email address</label>
                  <input id="email" type="email" required autoComplete="email"
                    className="w-full bg-surface border border-line rounded-xl px-5 py-4 text-ink font-medium shadow-sm focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20"
                    placeholder="student@thapar.edu or user@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {error && <div role="alert" className="bg-critical/10 border border-critical/20 px-4 py-3 rounded-lg"><p className="text-sm text-critical font-semibold">{error}</p></div>}
                <button type="submit" disabled={loading || !email}
                  className="w-full bg-series-1 hover:brightness-110 text-white font-bold text-base py-4 rounded-xl transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed">
                  {loading ? 'Sending code...' : 'Send reset code'}
                </button>
              </form>
            </>
          )}

          {step !== 'done' && (
            <div className="mt-6 pt-6 border-t border-line">
              <Link to="/login" className="flex items-center gap-2 text-sm font-semibold text-ink-secondary hover:text-series-1 transition-colors">
                <ArrowLeft size={16} /> Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
