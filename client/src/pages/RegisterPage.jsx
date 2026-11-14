/**
 * Student self-registration.
 *
 * Only ever creates a student: the API ignores any role in this request, and
 * handler/administrator accounts are provisioned by an existing administrator.
 * The client mirrors the server's password rule so the user gets the feedback
 * before a round trip, not after.
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Card, Field, inputClasses } from '../components/ui/index.jsx';
import { homePathFor } from '../components/ProtectedRoute.jsx';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function RegisterPage() {
  const { register, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to={homePathFor(user?.role)} replace />;

  /** @param {string} key */
  const update = (key) => (/** @type {React.ChangeEvent<any>} */ e) =>
    setForm((current) => ({ ...current, [key]: e.target.value }));

  /** @returns {Record<string, string>} */
  function validate() {
    /** @type {Record<string, string>} */
    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Enter your full name';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(form.email.trim())) {
      errors.email = 'Enter a valid e-mail address';
    }
    if (!PASSWORD_RULE.test(form.password)) {
      errors.password = 'At least 8 characters, including a letter and a number';
    }
    return errors;
  }

  /** @param {React.FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      navigate(homePathFor(created.role), { replace: true });
    } catch (err) {
      const apiError = /** @type {any} */ (err);
      if (apiError.details && typeof apiError.details === 'object') setFieldErrors(apiError.details);
      setError(apiError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <ShieldCheck size={28} className="text-series-1" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight text-ink">Create your account</h1>
          <p className="text-sm text-ink-secondary">Students can register directly.</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="Full name" htmlFor="name" error={fieldErrors.name} required>
              <input
                id="name"
                autoComplete="name"
                className={inputClasses}
                value={form.name}
                onChange={update('name')}
                aria-describedby={fieldErrors.name ? 'name-error' : undefined}
              />
            </Field>

            <Field label="E-mail address" htmlFor="email" error={fieldErrors.email} required>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={inputClasses}
                value={form.email}
                onChange={update('email')}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              error={fieldErrors.password}
              hint="At least 8 characters, including a letter and a number."
              required
            >
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                className={inputClasses}
                value={form.password}
                onChange={update('password')}
                aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
              />
            </Field>

            {error && Object.keys(fieldErrors).length === 0 && (
              <p role="alert" className="rounded-md bg-critical/10 px-3 py-2 text-xs text-critical">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              Create account
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-ink-muted">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-series-1 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
