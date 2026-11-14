/**
 * Citizen portal — file a complaint.
 *
 * The department is NOT chosen by the complainant. It is predicted by the
 * server's classification Strategy from the title and description, and the
 * result is shown back to the user after submission so the routing decision is
 * transparent rather than magic — including an honest note when the LLM was
 * unavailable and deterministic keyword rules were used instead.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleCheck, Info, Paperclip, Sparkles, Upload, X } from 'lucide-react';
import { complaintApi } from '../../api/endpoints.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, Field, SectionHeader, inputClasses } from '../../components/ui/index.jsx';
import { StatusBadge, PriorityBadge } from '../../components/StatusBadge.jsx';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

const TITLE_MIN = 5;
const TITLE_MAX = 200;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 5000;

export function NewComplaintPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const [form, setForm] = useState({ title: '', description: '' });
  const [file, setFile] = useState(/** @type {File | null} */ (null));
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(/** @type {any} */ (null));

  /** @param {React.ChangeEvent<HTMLInputElement>} event */
  function handleFile(event) {
    const selected = event.target.files?.[0] ?? null;
    setFieldErrors((current) => ({ ...current, attachment: '' }));

    if (!selected) {
      setFile(null);
      return;
    }
    // Mirror the server's limits so the user is told before a 10 MB upload.
    if (selected.size > MAX_BYTES) {
      setFieldErrors((c) => ({ ...c, attachment: 'That file is larger than 10 MB.' }));
      event.target.value = '';
      return;
    }
    if (!ACCEPTED.includes(selected.type)) {
      setFieldErrors((c) => ({ ...c, attachment: 'Attach a JPEG, PNG, WebP, GIF or PDF.' }));
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  /** @returns {Record<string, string>} */
  function validate() {
    /** @type {Record<string, string>} */
    const errors = {};
    const title = form.title.trim();
    const description = form.description.trim();
    if (title.length < TITLE_MIN) errors.title = `Add at least ${TITLE_MIN} characters.`;
    if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
    if (description.length < DESCRIPTION_MIN) {
      errors.description = `Describe the problem in at least ${DESCRIPTION_MIN} characters — detail improves routing.`;
    }
    if (description.length > DESCRIPTION_MAX) {
      errors.description = `Keep the description under ${DESCRIPTION_MAX} characters.`;
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
    setProgress(0);

    try {
      const data = await complaintApi.create(
        { title: form.title.trim(), description: form.description.trim(), attachment: file },
        setProgress,
      );
      setResult(data);
      toast.push(`Complaint #${data.complaint.id} filed and routed automatically.`, 'success');
    } catch (err) {
      const apiError = /** @type {any} */ (err);
      if (apiError.details && typeof apiError.details === 'object' && !apiError.details.field) {
        setFieldErrors(apiError.details);
      }
      setError(apiError.message);
    } finally {
      setSubmitting(false);
      setProgress(0);
    }
  }

  /* ---- confirmation ------------------------------------------------------ */
  if (result) {
    const { complaint, classification } = result;
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <div className="flex flex-col items-center gap-3 border-b border-line px-6 py-8 text-center">
            <CircleCheck size={30} className="text-good" aria-hidden />
            <h1 className="text-base font-semibold text-ink">Complaint #{complaint.id} received</h1>
            <p className="max-w-md text-sm text-ink-secondary">
              It has been routed automatically. You will be notified here and by e-mail at every step,
              and it escalates on its own if nobody responds.
            </p>
          </div>

          <div className="grid gap-px bg-line sm:grid-cols-2">
            <div className="bg-surface px-5 py-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Routed to</p>
              <p className="mt-1 text-sm font-medium text-ink">{complaint.department_name}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{classification.category}</p>
            </div>
            <div className="bg-surface px-5 py-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Status &amp; priority</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusBadge status={complaint.status} size="sm" />
                <PriorityBadge priority={complaint.priority} size="sm" />
              </div>
            </div>
          </div>

          <div className="border-t border-line px-5 py-4">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-secondary">
              <Sparkles size={13} className="mt-0.5 shrink-0 text-series-1" aria-hidden />
              <span>
                {classification.reasoning}{' '}
                <span className="text-ink-muted">
                  ({classification.strategy} engine, confidence{' '}
                  {(classification.confidence * 100).toFixed(0)}%)
                </span>
              </span>
            </p>
            {/* Told plainly rather than hidden: routing quality is degraded. */}
            {classification.degraded && (
              <p className="mt-2 flex items-start gap-2 rounded-md bg-serious/10 px-3 py-2 text-xs text-serious">
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                The AI classifier was unreachable, so keyword rules routed this complaint. A handler
                will confirm the department.
              </p>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setForm({ title: '', description: '' });
                clearFile();
              }}
            >
              File another
            </Button>
            <Button onClick={() => navigate(`/complaints/${complaint.id}`)}>Track this complaint</Button>
          </div>
        </Card>
      </div>
    );
  }

  /* ---- form -------------------------------------------------------------- */
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <SectionHeader
          title="File a complaint"
          description="Describe the problem in your own words — the right department is worked out for you."
        />

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 py-5" noValidate>
          <Field
            label="Title"
            htmlFor="title"
            error={fieldErrors.title}
            hint="A short summary, e.g. “No drinking water on hostel floor 3”."
            required
          >
            <input
              id="title"
              className={inputClasses}
              value={form.title}
              maxLength={TITLE_MAX}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              aria-describedby={fieldErrors.title ? 'title-error' : 'title-hint'}
            />
          </Field>

          <Field
            label="What happened?"
            htmlFor="description"
            error={fieldErrors.description}
            hint="Include where, when and who is affected. More detail routes it more accurately."
            required
          >
            <textarea
              id="description"
              rows={7}
              className={inputClasses}
              value={form.description}
              maxLength={DESCRIPTION_MAX}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              aria-describedby={fieldErrors.description ? 'description-error' : 'description-hint'}
            />
          </Field>
          <p className="-mt-3 text-right text-[11px] text-ink-muted tabular">
            {form.description.trim().length} / {DESCRIPTION_MAX}
          </p>

          <Field
            label="Attachment (optional)"
            htmlFor="attachment"
            error={fieldErrors.attachment}
            hint="A photo or PDF as evidence. JPEG, PNG, WebP, GIF or PDF, up to 10 MB."
          >
            {file ? (
              <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
                <Paperclip size={14} className="shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{file.name}</span>
                <span className="shrink-0 text-[11px] text-ink-muted tabular">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="shrink-0 rounded p-0.5 text-ink-muted transition hover:text-critical"
                  aria-label={`Remove ${file.name}`}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            ) : (
              <label
                htmlFor="attachment"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-5 text-xs text-ink-muted transition hover:border-series-1 hover:text-ink"
              >
                <Upload size={15} aria-hidden />
                Choose a file
              </label>
            )}
            <input
              ref={fileInputRef}
              id="attachment"
              type="file"
              className="sr-only"
              accept={ACCEPTED.join(',')}
              onChange={handleFile}
            />
          </Field>

          {submitting && progress > 0 && progress < 100 && (
            <div>
              <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-series-1 transition-all"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                />
              </div>
              <p className="mt-1 text-[11px] text-ink-muted tabular">Uploading… {progress}%</p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-critical/10 px-3 py-2 text-xs text-critical">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate('/complaints')}>
              Cancel
            </Button>
            <Button type="submit" size="lg" loading={submitting}>
              Submit complaint
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
