/**
 * The one dialog behind every lifecycle action.
 *
 * Its fields come from the server: each available transition carries a
 * `requires` array produced by the State pattern, so the form is generated from
 * the domain rules rather than duplicating them in the client. Add a guard on
 * the server and this dialog starts collecting the field with no change here.
 */
import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button, Field, inputClasses } from './ui/index.jsx';
import { transitionTone } from '../lib/format.js';

/** Copy for each field a transition may require. */
const FIELD_COPY = {
  assignedTo: { label: 'Assign to', hint: 'The handler who will own this complaint.' },
  departmentId: { label: 'Move to department', hint: 'Optional — only if this belongs elsewhere.' },
  resolutionNote: {
    label: 'What was done',
    hint: 'Shown to the complainant, who can reject it. At least 10 characters.',
  },
  closureNote: { label: 'Reason for closing', hint: 'At least 10 characters.' },
  reason: { label: 'Reason', hint: 'At least 10 characters.' },
};

/**
 * @param {{ open: boolean, onClose: () => void, transition: { to: string, label: string, requires: string[] } | null,
 *           complaint: any, handlers?: Array<any>, departments?: Array<any>,
 *           onSubmit: (body: Record<string, unknown>) => Promise<void> }} props
 */
export function TransitionDialog({
  open,
  onClose,
  transition,
  complaint,
  handlers = [],
  departments = [],
  onSubmit,
}) {
  const [values, setValues] = useState(/** @type {Record<string, string>} */ ({}));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [submitting, setSubmitting] = useState(false);

  // Reset whenever a different action is opened, so yesterday's note never
  // leaks into today's resolution.
  useEffect(() => {
    if (!open) return;
    setValues({
      assignedTo: complaint?.assigned_to ? String(complaint.assigned_to) : '',
      departmentId: complaint?.department_id ? String(complaint.department_id) : '',
    });
    setError(null);
    setFieldErrors({});
  }, [open, transition?.to, complaint?.id, complaint?.assigned_to, complaint?.department_id]);

  if (!transition) return null;

  const required = transition.requires ?? [];
  // Reassignment stays inside the Assigned state, so offer the department move
  // alongside the new owner.
  const fields = required.includes('assignedTo') ? [...required, 'departmentId'] : required;
  const visibleFields = [...new Set(fields)].filter((f) => f !== 'escalationLevel');

  /** @param {React.FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    /** @type {Record<string, unknown>} */
    const body = { to: transition.to };
    for (const field of visibleFields) {
      const raw = values[field]?.trim();
      if (!raw) continue;
      body[field] = field === 'assignedTo' || field === 'departmentId' ? Number(raw) : raw;
    }

    try {
      await onSubmit(body);
      onClose();
    } catch (err) {
      const apiError = /** @type {any} */ (err);
      // The server returns either per-field details or a single domain message
      // (an illegal transition). Surface whichever it gave us.
      if (apiError.details && typeof apiError.details === 'object' && !apiError.details.field) {
        setFieldErrors(apiError.details);
      } else if (apiError.details?.field) {
        setFieldErrors({ [apiError.details.field]: apiError.message });
      } else {
        setError(apiError.message ?? 'Could not complete this action.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={transition.label}
      description={`Complaint #${complaint?.id} — ${complaint?.title ?? ''}`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {visibleFields.length === 0 && (
          <p className="text-sm text-ink-secondary">
            This will move the complaint to <span className="font-medium text-ink">{transition.to}</span>.
          </p>
        )}

        {visibleFields.map((field) => {
          const copy = FIELD_COPY[field] ?? { label: field, hint: undefined };
          const id = `transition-${field}`;
          const fieldError = fieldErrors[field] ?? null;

          if (field === 'assignedTo' || field === 'departmentId') {
            const options = field === 'assignedTo' ? handlers : departments;
            return (
              <Field key={field} label={copy.label} htmlFor={id} error={fieldError} hint={copy.hint}>
                <select
                  id={id}
                  className={inputClasses}
                  value={values[field] ?? ''}
                  aria-describedby={fieldError ? `${id}-error` : `${id}-hint`}
                  onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                >
                  <option value="">
                    {field === 'assignedTo' ? 'Select a handler…' : 'Keep current department'}
                  </option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                      {field === 'assignedTo' && option.role === 'admin' ? ' (admin)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }

          return (
            <Field key={field} label={copy.label} htmlFor={id} error={fieldError} hint={copy.hint} required>
              <textarea
                id={id}
                rows={4}
                className={inputClasses}
                value={values[field] ?? ''}
                aria-describedby={fieldError ? `${id}-error` : `${id}-hint`}
                onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                placeholder="Be specific — this becomes part of the permanent record."
              />
            </Field>
          );
        })}

        {error && (
          <p role="alert" className="rounded-md bg-critical/10 px-3 py-2 text-xs text-critical">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            variant={
              { positive: 'positive', danger: 'danger', neutral: 'primary' }[
                transitionTone(transition.to, complaint?.status)
              ]
            }
          >
            {transition.label}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
