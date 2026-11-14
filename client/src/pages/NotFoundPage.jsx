import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { homePathFor } from '../components/ProtectedRoute.jsx';

export function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-sm p-8 text-center">
        <Compass size={28} className="mx-auto text-ink-muted" aria-hidden />
        <h1 className="mt-4 text-base font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          That address does not match anything in ResolveX.
        </p>
        <Link
          to={homePathFor(user?.role)}
          className="mt-5 inline-block text-sm font-medium text-series-1 hover:underline"
        >
          Back to your dashboard
        </Link>
      </Card>
    </div>
  );
}
