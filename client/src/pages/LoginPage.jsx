import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Sun, Moon, Monitor, ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { Spinner } from '../components/ui/index.jsx';
import { homePathFor } from '../components/ProtectedRoute.jsx';

function AnimatedHero() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let timeouts = [];
    const runSequence = () => {
      setStep(0); // Cursor at start
      timeouts.push(setTimeout(() => setStep(1), 800)); // Moving
      timeouts.push(setTimeout(() => setStep(2), 2200)); // Clicking
      timeouts.push(setTimeout(() => setStep(3), 2500)); // Resolved
      timeouts.push(setTimeout(() => setStep(4), 3500)); // Moving away
      timeouts.push(setTimeout(runSequence, 5500)); // Loop
    };
    runSequence();
    return () => timeouts.forEach(clearTimeout);
  }, []);

  // Cursor Positions
  let cursorX = '250px';
  let cursorY = '300px';
  let cursorScale = '1';
  let cursorOpacity = '1';

  if (step === 0) {
    cursorX = '250px'; cursorY = '300px'; cursorOpacity = '0';
  } else if (step === 1) {
    cursorX = '320px'; cursorY = '120px';
  } else if (step === 2) {
    cursorX = '320px'; cursorY = '120px'; cursorScale = '0.9';
  } else if (step === 3) {
    cursorX = '320px'; cursorY = '120px';
  } else if (step === 4) {
    cursorX = '400px'; cursorY = '200px'; cursorOpacity = '0';
  }

  // Button States
  const isResolved = step >= 3;
  const isPressing = step === 2;

  return (
    <div className="w-full h-full relative flex items-center justify-center overflow-hidden bg-surface-2 p-12">
      {/* Decorative background grid */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      
      <div className="w-full max-w-[420px] bg-plane border border-line rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-6 relative z-10">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-bold text-ink text-lg tracking-tight">Active Queue</h3>
          <div className="w-16 h-2 bg-surface-2 rounded-full border border-line"></div>
        </div>
        
        <div className="flex flex-col gap-4">
          {/* Card 1 - The Animated Target */}
          <div className={`border rounded-xl p-4 flex justify-between items-center relative transition-all duration-500 ${isResolved ? 'bg-surface border-good/30' : 'bg-surface border-line'}`}>
            <div>
              <p className="font-semibold text-ink text-sm">Broken AC in Library</p>
              <p className="text-xs text-ink-muted mt-1">Facilities • 2 hours ago</p>
            </div>
            
            <div 
              className={`flex items-center justify-center w-28 py-2 rounded-lg text-xs font-bold transition-all duration-300 shadow-sm ${
                isPressing ? 'scale-95 brightness-90' : 'scale-100'
              } ${
                isResolved 
                  ? 'bg-good text-white shadow-good/20' 
                  : 'bg-series-1 text-white shadow-series-1/20'
              }`}
            >
              {isResolved ? (
                <span className="flex items-center gap-1.5"><Check size={14} /> Resolved</span>
              ) : (
                'Resolve'
              )}
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-surface border border-line rounded-xl p-4 flex justify-between items-center opacity-70">
            <div>
              <p className="font-semibold text-ink text-sm">Wi-Fi down in Dorm A</p>
              <p className="text-xs text-ink-muted mt-1">IT Services • 5 hours ago</p>
            </div>
            <div className="flex items-center justify-center w-28 py-2 rounded-lg text-xs font-bold bg-surface-2 text-ink-secondary border border-line">
              Pending
            </div>
          </div>
          
          {/* Card 3 */}
          <div className="bg-surface border border-line rounded-xl p-4 flex justify-between items-center opacity-40">
            <div>
              <p className="font-semibold text-ink text-sm">Leaking pipe</p>
              <p className="text-xs text-ink-muted mt-1">Facilities • 1 day ago</p>
            </div>
            <div className="flex items-center justify-center w-28 py-2 rounded-lg text-xs font-bold bg-surface-2 text-ink-secondary border border-line">
              Pending
            </div>
          </div>
        </div>

        {/* Animated Mouse Cursor */}
        <div 
          className="absolute z-50 pointer-events-none drop-shadow-xl"
          style={{ 
            top: 0, left: 0,
            transform: `translate(${cursorX}, ${cursorY}) scale(${cursorScale})`,
            opacity: cursorOpacity,
            transition: 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.5s ease'
          }}
        >
          <svg width="28" height="38" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5.65376 33.8213L0 0L24 16.9106L13.7844 19.3375L20.0822 31.0666L15.3621 33.6062L8.98393 21.6881L5.65376 33.8213Z" fill="black" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login, isAuthenticated, initialising, user } = useAuth();
  const { theme, cycle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (initialising) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-plane">
        <Spinner label="Checking your session…" />
      </div>
    );
  }
  if (isAuthenticated) {
    return <Navigate to={homePathFor(user?.role)} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const signedIn = await login(email, password);
      const from = location.state?.from?.pathname;
      navigate(from ?? homePathFor(signedIn.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-plane text-ink font-sans overflow-hidden">
      
      {/* Theme Toggle Top Right */}
      <div className="absolute top-6 right-6 z-50">
        <button
          type="button"
          onClick={cycle}
          className="rounded-full bg-surface-2 p-3 text-ink-secondary shadow-lg transition-all hover:scale-110 hover:text-ink hover:shadow-xl border border-line"
          aria-label={`Theme: ${theme}. Click to change.`}
          title={`Theme: ${theme}`}
        >
          {theme === 'light' ? <Sun size={20} /> : theme === 'dark' ? <Moon size={20} /> : <Monitor size={20} />}
        </button>
      </div>

      {/* Left Pane - Animated UI Hero */}
      <div className="hidden lg:flex w-[55%] relative items-center justify-center border-r border-line bg-surface">
        <AnimatedHero />

        {/* Decorative Badge */}
        <div className="absolute top-10 left-12 z-10 flex items-center gap-3">
          <div className="w-12 h-12 bg-series-1 rounded-xl flex items-center justify-center text-white shadow-xl">
            <ShieldCheck size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink drop-shadow-md">ResolveX</h1>
            <p className="text-[10px] font-bold tracking-[0.25em] text-series-1 uppercase drop-shadow-sm">Your Voice Matters</p>
          </div>
        </div>
      </div>

      {/* Right Pane - Form */}
      <div className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 md:px-24 relative z-10 bg-plane shadow-[-20px_0_50px_rgba(0,0,0,0.05)]">
        
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="flex lg:hidden items-center gap-3 mb-16">
          <div className="w-12 h-12 bg-series-1 rounded-xl flex items-center justify-center text-white shadow-lg">
            <ShieldCheck size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink">ResolveX</h1>
          </div>
        </div>

        <div className="max-w-md w-full mx-auto lg:mx-0">
          <div className="mb-2 inline-block rounded-full bg-surface-2 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-series-1 border border-line">
            Secure Portal
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-ink leading-[1.1] tracking-tight mb-4 mt-4">
            Report. Track. <br/>
            <span className="text-series-1">Resolve.</span>
          </h2>
          <p className="text-ink-secondary text-base leading-relaxed mb-10 font-medium">
            Join thousands of students shaping the campus. Sign in to escalate your grievances directly to the right department.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
            <div className="group">
              <label htmlFor="email" className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2 transition-colors group-focus-within:text-series-1">
                University Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="w-full bg-surface border border-line rounded-xl px-5 py-4 text-ink font-medium shadow-sm focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20 transition-all placeholder:text-ink-muted/50"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@resolvex.edu"
              />
            </div>

            <div className="group">
              <label htmlFor="password" className="block text-[11px] font-bold text-ink-secondary uppercase tracking-widest mb-2 transition-colors group-focus-within:text-series-1">
                Password
              </label>
              <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="w-full bg-surface border border-line rounded-xl px-5 py-4 pr-12 text-ink font-medium shadow-sm focus:outline-none focus:border-series-1 focus:ring-4 focus:ring-series-1/20 transition-all placeholder:text-ink-muted/50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink" tabIndex={0}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              </div>
            </div>

              <div className="flex justify-end -mt-2">
                <Link to="/forgot-password" className="text-xs font-semibold text-ink-muted hover:text-series-1 transition-colors">
                  Forgot password?
                </Link>
              </div>

            {error && (
              <div role="alert" className="flex items-center gap-3 bg-critical/10 border border-critical/20 px-4 py-3 rounded-lg mt-2">
                <div className="w-1.5 h-6 rounded-full bg-critical"></div>
                <p className="text-sm text-critical font-semibold">{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              disabled={submitting}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-series-1 hover:brightness-110 text-white font-bold text-base py-4 rounded-xl transition-all shadow-lg hover:shadow-series-1/30 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
            >
              {submitting ? 'Authenticating...' : 'Secure Sign In'}
              {!submitting && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-line flex flex-col gap-4">
            <p className="text-center text-sm font-medium text-ink-secondary">
              Prefer a one-time code?{' '}
              <Link to="/login/otp" className="font-bold text-series-1 hover:underline">
                Sign in with email code
              </Link>
            </p>
            <p className="text-center text-sm font-medium text-ink-secondary">
              Don't have an account yet?{' '}
              <Link to="/register" className="font-bold text-series-1 hover:underline hover:text-series-2 transition-colors">
                Create a profile
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
