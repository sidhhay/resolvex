import React from 'react';

export function StickmanAnimation() {
  return (
    <div className="w-full flex justify-center items-center py-6">
      <div className="relative w-64 h-32 flex items-center justify-between overflow-hidden">
        
        {/* Stickman */}
        <div className="relative w-16 h-24 flex flex-col items-center animate-bounce-slow">
          {/* Head */}
          <div className="w-6 h-6 rounded-full border-2 border-ink"></div>
          {/* Body */}
          <div className="w-0.5 h-10 bg-ink"></div>
          {/* Left Arm (throwing motion) */}
          <div className="absolute top-8 left-2 w-0.5 h-6 bg-ink origin-bottom -rotate-45 animate-throw-arm"></div>
          {/* Right Arm */}
          <div className="absolute top-8 right-2 w-0.5 h-6 bg-ink origin-top rotate-12"></div>
          {/* Legs */}
          <div className="absolute top-16 left-2 w-0.5 h-8 bg-ink origin-top rotate-12"></div>
          <div className="absolute top-16 right-2 w-0.5 h-8 bg-ink origin-top -rotate-12"></div>
        </div>

        {/* The Complaint Paper */}
        <div className="absolute left-12 top-10 w-4 h-5 border-2 border-series-1 bg-surface-2 rounded-sm rotate-12 animate-toss-paper">
          <div className="w-2 h-0.5 bg-series-1 mt-1 ml-0.5"></div>
          <div className="w-2 h-0.5 bg-series-1 mt-0.5 ml-0.5"></div>
        </div>

        {/* Complaint Box */}
        <div className="relative w-20 h-20 border-4 border-ink rounded-lg bg-surface flex items-center justify-center">
          <div className="absolute top-0 w-12 h-1 bg-ink rounded-full -mt-2"></div>
          <span className="text-xs font-bold text-ink mt-2">BOX</span>
        </div>

      </div>

      <style>{`
        @keyframes toss-paper {
          0% {
            transform: translate(0, 0) rotate(0deg) scale(1);
            opacity: 1;
          }
          50% {
            transform: translate(80px, -30px) rotate(180deg) scale(0.8);
            opacity: 1;
          }
          90% {
            transform: translate(140px, 20px) rotate(360deg) scale(0.5);
            opacity: 0.8;
          }
          100% {
            transform: translate(150px, 30px) rotate(400deg) scale(0.2);
            opacity: 0;
          }
        }
        @keyframes throw-arm {
          0%, 100% { transform: rotate(-45deg); }
          50% { transform: rotate(45deg); }
        }
        .animate-toss-paper {
          animation: toss-paper 2s infinite ease-in-out;
        }
        .animate-throw-arm {
          animation: throw-arm 2s infinite ease-in-out;
        }
        .animate-bounce-slow {
          animation: bounce 2s infinite;
        }
      `}</style>
    </div>
  );
}
