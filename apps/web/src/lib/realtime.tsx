import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { NotificationDTO, ServerToClientEvents } from '@urbanfix/shared';
import { isMunicipal, useAuth } from './auth';
import { qk } from './query';
import { getSocket } from './socket';

/** Connects the realtime socket and keeps React Query caches in sync with server events. */
export function useRealtime() {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const socket = getSocket(token);

    const onNotification: ServerToClientEvents['notification:new'] = (n: NotificationDTO) => {
      qc.invalidateQueries({ queryKey: qk.notifications });
      if (n.issueId) qc.invalidateQueries({ queryKey: qk.issue(n.issueId) });
      if (n.type === 'VERIFICATION_REQUEST') qc.invalidateQueries({ queryKey: qk.pendingVerifications });
      const open = () =>
        navigate(
          n.type === 'VERIFICATION_REQUEST' && n.issueId
            ? `/verify/${n.issueId}`
            : n.issueId
              ? `/issues/${n.issueId}`
              : '/notifications',
        );
      toast(n.title, {
        description: n.body,
        action: n.issueId
          ? { label: n.type === 'VERIFICATION_REQUEST' ? 'Verify' : 'View', onClick: open }
          : undefined,
      });
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const sys = new Notification(n.title, { body: n.body, tag: n.id, icon: '/pwa-192.png' });
        sys.onclick = () => {
          window.focus();
          open();
        };
      }
    };
    const onIssueUpdated: ServerToClientEvents['issue:updated'] = (p) => {
      qc.invalidateQueries({ queryKey: qk.issue(p.id) });
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['manage'] });
    };
    const onIssueCreated: ServerToClientEvents['issue:created'] = () => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['manage'] });
    };
    const onUploadAnalyzed: ServerToClientEvents['upload:analyzed'] = (p) => {
      qc.invalidateQueries({ queryKey: qk.upload(p.id) });
    };

    socket.on('notification:new', onNotification);
    socket.on('issue:updated', onIssueUpdated);
    socket.on('issue:created', onIssueCreated);
    socket.on('upload:analyzed', onUploadAnalyzed);
    socket.emit('map:watch');
    return () => {
      socket.off('notification:new', onNotification);
      socket.off('issue:updated', onIssueUpdated);
      socket.off('issue:created', onIssueCreated);
      socket.off('upload:analyzed', onUploadAnalyzed);
    };
  }, [token, qc, navigate, user?.id]);

  return { municipal: isMunicipal(user) };
}

/** Joins the issue's room while a page shows it, for live status/support updates. */
export function useWatchIssue(issueId: string | undefined) {
  const token = useAuth((s) => s.token);
  useEffect(() => {
    if (!issueId) return;
    const s = getSocket(token);
    const join = () => s.emit('issue:watch', issueId);
    join();
    s.on('connect', join);
    return () => {
      s.off('connect', join);
      s.emit('issue:unwatch', issueId);
    };
  }, [issueId, token]);
}

/** Subscribes a component to one server event on the shared socket. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
) {
  const token = useAuth((s) => s.token);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const s = getSocket(token);
    const fn = ((...args: unknown[]) =>
      (ref.current as (...a: unknown[]) => void)(...args)) as ServerToClientEvents[E];
    s.on(event, fn as never);
    return () => {
      s.off(event, fn as never);
    };
  }, [event, token]);
}
