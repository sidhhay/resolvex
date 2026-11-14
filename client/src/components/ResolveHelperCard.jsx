import React, { useState, useEffect } from 'react';
import { Bot, Sparkles, Send } from 'lucide-react';

const snippetLines = [
  { prefix: "const issue = 'Broken AC in room 402';", color: "text-ink", delay: 0 },
  { prefix: "await ResolveAI.classify(issue);", color: "text-series-1", delay: 1500 },
  { prefix: "// Analysis complete.", color: "text-ink-muted", delay: 3000 },
  { prefix: "Category: Facilities", color: "text-series-2", delay: 3500 },
  { prefix: "Priority: HIGH", color: "text-critical", delay: 4000 },
  { prefix: "Action: Routed to HOD immediately.", color: "text-good", delay: 4500 }
];

export function ResolveHelperCard() {
  const [visibleLines, setVisibleLines] = useState([]);

  useEffect(() => {
    let timeouts = [];
    const runAnimation = () => {
      setVisibleLines([]);
      snippetLines.forEach((line, i) => {
        const timeout = setTimeout(() => {
          setVisibleLines(prev => [...prev, line]);
        }, line.delay);
        timeouts.push(timeout);
      });

      // Loop animation every 8 seconds
      const loopTimeout = setTimeout(() => {
        runAnimation();
      }, 8000);
      timeouts.push(loopTimeout);
    };

    runAnimation();

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-surface border border-line p-6 shadow-sm mb-6 transition-colors duration-300">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-ink mb-1">Resolve AI</h2>
        <p className="text-sm text-ink-secondary">
          Built into every step — tracking, routing, classifying and accelerating your complaint resolution.
        </p>
      </div>

      {/* Inner App Window Mockup */}
      <div className="relative rounded-lg bg-plane border border-line shadow-inner flex flex-col overflow-hidden h-60">
        {/* Fake window header */}
        <div className="flex items-center px-4 py-2 bg-surface border-b border-line">
          <div className="flex gap-2 mr-4">
            <div className="w-2.5 h-2.5 rounded-full bg-critical" />
            <div className="w-2.5 h-2.5 rounded-full bg-warning" />
            <div className="w-2.5 h-2.5 rounded-full bg-good" />
          </div>
          <div className="flex gap-4 text-xs font-medium text-ink-muted">
            <span className="text-series-1 border-b border-series-1 pb-0.5">Console</span>
            <span>Logs</span>
          </div>
        </div>

        {/* Fake content body */}
        <div className="flex-1 p-5 font-mono text-xs text-ink bg-plane overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Bot size={16} className="text-series-1" />
            </div>
            <div className="leading-relaxed flex flex-col gap-1.5 min-h-[120px]">
              {visibleLines.map((line, idx) => (
                <div 
                  key={idx} 
                  className={`opacity-0 animate-fade-in ${line.color} transition-all duration-500 transform translate-y-0`}
                  style={{ animation: `fadeIn 0.3s forwards` }}
                >
                  {line.prefix}
                </div>
              ))}
              <span className="w-2 h-4 bg-ink-muted animate-pulse inline-block mt-1"></span>
            </div>
          </div>
        </div>

        {/* Fake bottom toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-surface border-t border-line">
          <span className="text-[11px] text-ink-muted flex items-center gap-1.5">
            <Sparkles size={12} className="text-series-1" /> AI routing active
          </span>
          <button className="flex items-center gap-1.5 bg-series-1 text-white text-[11px] font-medium px-3 py-1 rounded transition hover:opacity-90">
            <Send size={10} /> Auto-Resolve
          </button>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
