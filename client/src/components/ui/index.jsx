/**
 * Small presentational primitives.
 *
 * Grouped in one module because each is a handful of lines; splitting them
 * across eight files would be more ceremony than substance.
 */
import { LoaderCircle } from 'lucide-react';

/* -------------------------------------------------------------------------- */

const BUTTON_VARIANTS = {
  primary: 'bg-series-1 text-white hover:brightness-110 disabled:hover:brightness-100',
  secondary: 'bg-surface-2 text-ink ring-1 ring-line-strong hover:bg-line',
  ghost: 'text-ink-secondary hover:bg-surface-2 hover:text-ink',
  positive: 'bg-good text-white hover:brightness-110 disabled:hover:brightness-100',
  danger: 'bg-critical text-white hover:brightness-110 disabled:hover:brightness-100',
};

const BUTTON_SIZES = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
};

/**
 * @param {{ variant?: keyof typeof BUTTON_VARIANTS, size?: keyof typeof BUTTON_SIZES,
 *           loading?: boolean, className?: string, children?: React.ReactNode }
 *         & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  children,
  ...rest
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      // aria-busy tells assistive tech the control is working, not broken.
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-55 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
    >
      {loading && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

/** @param {{ className?: string, children?: React.ReactNode }} props */
export function Card({ className = '', children, ...rest }) {
  return (
    <div {...rest} className={`rounded-xl bg-surface ring-1 ring-line ${className}`}>
      {children}
    </div>
  );
}

/**
 * @param {{ title: string, description?: string, actions?: React.ReactNode }} props
 */
export function SectionHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A labelled form control with inline validation messaging.
 * @param {{ label: string, htmlFor: string, error?: string | null, hint?: string,
 *           required?: boolean, children: React.ReactNode }} props
 */
export function Field({ label, htmlFor, error, hint, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-secondary">
        {label}
        {required && (
          <span className="ml-0.5 text-critical" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {/* The error is wired to the input via aria-describedby by each caller. */}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-critical">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export const inputClasses =
  'w-full rounded-md bg-surface px-3 py-2 text-sm text-ink ring-1 ring-line-strong transition placeholder:text-ink-muted focus:ring-2 focus:ring-series-1 disabled:opacity-60';

/* -------------------------------------------------------------------------- */

/** @param {{ label?: string, className?: string }} props */
export function Spinner({ label = 'Loading', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-ink-muted ${className}`} role="status">
      <LoaderCircle size={18} className="animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/**
 * @param {{ icon?: React.ComponentType<any>, title: string, description?: string,
 *           action?: React.ReactNode }} props
 */
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      {Icon && <Icon size={26} className="text-ink-muted" aria-hidden />}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * @param {{ message: string, onRetry?: () => void }} props
 */
export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-critical">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
