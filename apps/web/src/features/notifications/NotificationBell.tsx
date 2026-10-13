import { Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { useUnreadCount } from './useUnreadCount';

export function UnreadDot({ count, className }: { count: number; className?: string }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          className={cn(
            'absolute -right-1 -top-1 grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-full bg-cone px-1 font-mono text-[0.65rem] font-bold text-white ring-2 ring-surface',
            className,
          )}
        >
          {count > 99 ? '99+' : count}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function NotificationBell() {
  const { data: count = 0 } = useUnreadCount();
  return (
    <Link
      to="/notifications"
      className="relative grid size-10 place-items-center rounded-xl text-ink hover:bg-surface-2"
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
    >
      <Bell className="size-5" />
      <UnreadDot count={count} />
    </Link>
  );
}
