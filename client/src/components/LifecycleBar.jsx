import React from 'react';
import { User, Activity, PackageCheck, Archive, FileText, ArrowRight } from 'lucide-react';

const STAGES = [
  { id: 'SUBMITTED', label: 'Submitted', icon: User, desc: 'Complaint filed' },
  { id: 'IN_PROGRESS', label: 'In Progress', icon: Activity, desc: 'Being reviewed' },
  { id: 'RESOLVED', label: 'Resolved', icon: PackageCheck, desc: 'Solution provided' },
  { id: 'CLOSED', label: 'Closed', icon: Archive, desc: 'Case archived' }
];

export function LifecycleBar({ currentStatus = 'SUBMITTED' }) {
  const currentIndex = STAGES.findIndex(s => s.id === currentStatus);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  // Calculate the percentage for the progress line
  const progressPercentage = (activeIndex / (STAGES.length - 1)) * 100;

  return (
    <div className="w-full py-8 px-4 relative overflow-hidden bg-plane rounded-xl shadow-sm border border-line mb-8">
      <div className="mb-8 text-center">
        <h3 className="text-lg font-semibold text-ink">Complaint Lifecycle</h3>
        <p className="text-sm text-ink-secondary">Tracking your grievance to resolution</p>
      </div>

      <div className="relative max-w-3xl mx-auto mt-12 mb-8">
        {/* Background Track */}
        <div className="absolute top-1/2 left-0 w-full h-2 bg-surface-2 rounded-full -translate-y-1/2 border border-line"></div>
        
        {/* Progress Track */}
        <div 
          className="absolute top-1/2 left-0 h-2 bg-series-1 rounded-full -translate-y-1/2 transition-all duration-1000 ease-in-out shadow-[0_0_10px_var(--series-1)]"
          style={{ width: `${progressPercentage}%` }}
        ></div>

        {/* The "Person" moving the complaint */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 -ml-6 transition-all duration-1000 ease-in-out z-20 flex flex-col items-center"
          style={{ left: `${progressPercentage}%` }}
        >
          <div className="relative animate-bounce">
            {/* The person and the complaint box */}
            <div className="flex items-center text-series-1 bg-surface rounded-full p-2 shadow-lg border-2 border-series-1">
              <User size={24} />
              <ArrowRight size={16} className="mx-1 text-ink-muted" />
              <FileText size={20} className="text-series-1" />
            </div>
          </div>
        </div>

        {/* Nodes for each stage */}
        <div className="relative z-10 flex justify-between">
          {STAGES.map((stage, idx) => {
            const isCompleted = idx <= activeIndex;
            const isCurrent = idx === activeIndex;
            const Icon = stage.icon;

            return (
              <div key={stage.id} className="flex flex-col items-center w-24">
                <div 
                  className={`flex items-center justify-center w-12 h-12 rounded-full border-4 transition-colors duration-500 bg-surface shadow-sm
                    ${isCompleted ? 'border-series-1 text-series-1' : 'border-line text-ink-muted'}`}
                >
                  <Icon size={20} />
                </div>
                <div className="mt-4 text-center">
                  <p className={`text-sm font-bold ${isCurrent ? 'text-series-1 drop-shadow-md' : isCompleted ? 'text-ink' : 'text-ink-secondary'}`}>
                    {stage.label}
                  </p>
                  <p className="text-xs text-ink-muted mt-1">{stage.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
