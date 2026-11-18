import React from 'react';
import {
  FileText,
  UserCheck,
  Search,
  CheckCircle2,
  Archive,
  AlertTriangle,
  ArrowRight,
  User,
} from 'lucide-react';

const STAGES = [
  {
    key: 'submitted',
    label: 'Submitted',
    icon: FileText,
    desc: 'Complaint filed & classified',
  },
  {
    key: 'assigned',
    label: 'Assigned',
    icon: UserCheck,
    desc: 'Routed to handler',
  },
  {
    key: 'investigating',
    label: 'Investigating',
    icon: Search,
    desc: 'Investigation in progress',
  },
  {
    key: 'resolved',
    label: 'Resolved',
    icon: CheckCircle2,
    desc: 'Solution proposed',
  },
  {
    key: 'closed',
    label: 'Closed',
    icon: Archive,
    desc: 'Verified & archived',
  },
];

/**
 * Maps any ResolveX status string to its 0-4 stage index.
 * @param {string} [status]
 * @returns {number}
 */
function getStageIndex(status) {
  if (!status) return 0;
  const s = String(status).trim().toLowerCase();
  switch (s) {
    case 'submitted':
      return 0;
    case 'assigned':
      return 1;
    case 'investigating':
    case 'in_progress':
    case 'in progress':
      return 2;
    case 'escalated':
      return 2; // Active high-priority investigation stage
    case 'resolved':
      return 3;
    case 'closed':
      return 4;
    default:
      return 0;
  }
}

export function LifecycleBar({ currentStatus = 'Submitted' }) {
  const activeIndex = getStageIndex(currentStatus);
  const isEscalated = String(currentStatus).trim().toLowerCase() === 'escalated';
  const isClosed = String(currentStatus).trim().toLowerCase() === 'closed';

  // Calculate percentage along the 5 nodes (0%, 25%, 50%, 75%, 100%)
  const progressPercentage = (activeIndex / (STAGES.length - 1)) * 100;

  return (
    <div className="w-full py-6 px-4 md:px-6 relative overflow-hidden bg-plane rounded-xl shadow-sm border border-line mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <h3 className="text-sm md:text-base font-semibold text-ink">
            Complaint Lifecycle
          </h3>
          <p className="text-xs text-ink-secondary">
            Tracking your grievance from submission to closure
          </p>
        </div>

        {/* Current status pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isEscalated ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/30 animate-pulse">
              <AlertTriangle size={13} />
              SLA Escalated (High Priority)
            </span>
          ) : isClosed ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-good/10 text-good border border-good/30">
              <CheckCircle2 size={13} />
              Case Completed & Closed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-series-1/10 text-series-1 border border-series-1/20">
              Current: <strong className="font-bold">{currentStatus}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="relative max-w-2xl mx-auto my-8">
        {/* Background Track */}
        <div className="absolute top-6 left-4 right-4 h-1.5 bg-surface-2 rounded-full -translate-y-1/2 border border-line" />

        {/* Dynamic Progress Fill */}
        <div
          className={`absolute top-6 left-4 h-1.5 rounded-full -translate-y-1/2 transition-all duration-700 ease-in-out ${
            isEscalated ? 'bg-amber-500' : 'bg-series-1'
          }`}
          style={{
            width: `calc(${progressPercentage}% * (1 - 32px / 100%))`,
            maxWidth: 'calc(100% - 32px)',
          }}
        />

        {/* Nodes for each stage */}
        <div className="relative z-10 flex justify-between items-start">
          {STAGES.map((stage, idx) => {
            const isCompleted = idx <= activeIndex;
            const isCurrent = idx === activeIndex;
            const Icon = stage.icon;

            let iconColorClass = 'border-line text-ink-muted bg-surface';
            if (isCurrent && isEscalated) {
              iconColorClass =
                'border-amber-500 bg-amber-500/10 text-amber-600 ring-4 ring-amber-500/20';
            } else if (isCurrent) {
              iconColorClass =
                'border-series-1 bg-series-1/10 text-series-1 ring-4 ring-series-1/20';
            } else if (isCompleted) {
              iconColorClass =
                'border-series-1 bg-series-1 text-white shadow-sm';
            }

            return (
              <div
                key={stage.key}
                className="flex flex-col items-center text-center w-16 sm:w-24 group"
              >
                {/* Stage Circle Node */}
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-500 ${iconColorClass}`}
                  title={`${stage.label}: ${stage.desc}`}
                >
                  <Icon size={20} />
                </div>

                {/* Stage Labels */}
                <div className="mt-3">
                  <p
                    className={`text-xs sm:text-sm font-semibold transition-colors ${
                      isCurrent
                        ? isEscalated
                          ? 'text-amber-600 font-bold'
                          : 'text-series-1 font-bold'
                        : isCompleted
                        ? 'text-ink font-medium'
                        : 'text-ink-muted'
                    }`}
                  >
                    {isCurrent && isEscalated && stage.key === 'investigating'
                      ? 'Escalated'
                      : stage.label}
                  </p>
                  <p className="hidden sm:block text-[10px] text-ink-muted mt-0.5 leading-tight">
                    {stage.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
