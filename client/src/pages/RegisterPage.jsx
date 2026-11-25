/**
 * Student self-registration with email ownership verification.
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Card, Field, inputClasses } from '../components/ui/index.jsx';
import { homePathFor } from '../components/ProtectedRoute.jsx';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\\d).{8,}$/;
const EMAIL_RULE = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$/;

export function RegisterPage() {
  const { register, verifyRegistration, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [code, setCode] = useState('');
  const [step, setStep] = useState('details');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to={homePathFor(user?.role)} replace />;

  const update = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Enter your full name';
    if (!EMAIL_RULE.test(form.email.trim())) errors.email = 'Enter a valid e-mail address';
    if (!PASSWORD_RULE.test(form.password)) errors.password = 'At least 8 characters, including a letter and a number';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      setStep('verify');
      setNotice('We sent a 6-digit verification code to your email. It expires in 10 minutes.');
    } catch (err) {
      const apiError = /** @type {any} */ (err);
      if (apiError.details && typeof apiError.details === 'object') setFieldErrors(apiError.details);
      setError(apiError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (!/^\\d{6}$/.test(code)) {
      setError('Enter the 6-digit code sent to your email.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await verifyRegistration(form.email.trim(), code);
      navigate(homePathFor(created.role), { replace: true });
    } catch (err) {
      setError(/** @type {any} */ (err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <ShieldCheck size={28} className="text-series-1" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {step === 'details' ? 'Create your account' : 'Verify your email'}
          </h1>
          <p className="text-sm text-ink-secondary">
            {step === 'details' ? 'Create a student account with your email address.' : `Enter the code sent to ${form.email}.`}
          </p>
        </div>

        <Card className="p-6">
          {step === 'details' ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <Field label="Full name" htmlFor="name" error={fieldErrors.name} required>
                <input id="name" autoComplete="name" className={inputClasses} value={form.name} onChange={update('name')} />
              </Field>
              <Field label="E-mail address" htmlFor="email" error={fieldErrors.email} required>
                <input id="email" type="email" autoComplete="email" className={inputClasses} value={form.email} onChange={update('email')} />
              </Field>
              <Field label="Password" htmlFor="password" error={fieldErrors.password} hint="At least 8 characters, including a letter and a number." required>
                <input id="password" type="password" autoComplete="new-password" className={inputClasses} value={form.password} onChange={update('password')} />
              </Field>
              {error && <p role="alert" className="rounded-md bg-critical/10 px-3 py-2 text-xs text-critical">{error}</p>}
              <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">Send verification code</Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <Field label="6-digit verification code" htmlFor="code" required>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className={inputClasses}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\\D/g, '').slice(0, 6))}
                  placeholder="000000"
                />
              </Field>
              {notice && <p className="rounded-md bg-series-1/10 px-3 py-2 text-xs text-ink">{notice}</p>}
              {error && <p role="alert" className="rounded-md bg-critical/10 px-3 py-2 text-xs text-critical">{error}</p>}
              <Button type="submit" size="lg" loading={submitting} className="w-full">Verify email and create account</Button>
              <button type="button" onClick={() => { setStep('details'); setCode(''); setError(null); setNotice(null); }} className="inline-flex items-center justify-center gap-2 text-xs text-ink-secondary hover:text-ink">
                <ArrowLeft size={14} /> Back to details
              </button>
            </form>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-ink-muted">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-series-1 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
