import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Mail } from 'lucide-react';
import { authApi } from '../api/endpoints.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
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
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-good/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail size={28} className="text-good" />
              </div>
              <h2 className="text-xl font-bold text-ink mb-2">Check your inbox</h2>
              <p className="text-ink-secondary text-sm leading-relaxed mb-6">
                If <span className="font-semibold text-ink">{email}</span> is registered with ResolveX, a secure password reset link has been sent to that address.
              </p>

              <Link to="/login" className="text-sm font-bold text-series-1 hover:underline">
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-ink mb-1">Forgot your password?</h2>
              <p className="text-ink-secondary text-sm mb-6">
                Enter your university email and we'll send a reset link.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
                <div className="group">
                  <label htmlFor="email" className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2 transition-colors group-focus-within:text-series-1">
                    University Email
                  </label>
                  <input
                    id="email"
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
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-line">
                <Link to="/login" className="flex items-center gap-2 text-sm font-semibold text-ink-secondary hover:text-series-1 transition-colors">
                  <ArrowLeft size={16} />
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
