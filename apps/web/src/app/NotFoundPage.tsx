import { Link } from 'react-router';
import { EmptyState } from '../components/ui/misc';
import { TrafficCone } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={<TrafficCone />}
      title="Road closed"
      body="There is nothing at this address. It may have moved, or the link is incomplete."
      action={
        <Link to="/" className="rounded-xl bg-signal px-4 py-2.5 font-display font-bold text-white">
          Back to home
        </Link>
      }
    />
  );
}
