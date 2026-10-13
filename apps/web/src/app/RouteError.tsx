import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { TrafficCone } from 'lucide-react';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : (error as Error)?.message;
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <TrafficCone className="mx-auto size-12 text-cone" />
        <h1 className="mt-4 text-2xl font-extrabold">This page hit a roadblock</h1>
        <p className="mt-2 text-sm text-muted">{message || 'An unexpected error occurred.'}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-signal px-4 py-2.5 font-display font-bold text-white"
          >
            Reload
          </button>
          <Link to="/" className="rounded-xl border border-line px-4 py-2.5 font-display font-bold">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
