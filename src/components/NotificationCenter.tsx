import { useEffect, useRef, useState } from 'react';
import type { NotificationDetail } from '../utils/notifications';

interface VisibleNotification extends NotificationDetail {
  id: number;
}

export default function NotificationCenter() {
  const [notification, setNotification] = useState<VisibleNotification | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleNotification = (event: Event) => {
      const detail = (event as CustomEvent<NotificationDetail>).detail;
      if (!detail?.message) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setNotification({ ...detail, id: Date.now() });
      timerRef.current = setTimeout(
        () => setNotification(null),
        detail.duration ?? 2200,
      );
    };

    window.addEventListener('mac-editor:notify', handleNotification);
    return () => {
      window.removeEventListener('mac-editor:notify', handleNotification);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!notification) return null;

  const tone = notification.tone ?? 'info';
  return (
    <div
      key={notification.id}
      className={`app-notification is-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="app-notification-icon" aria-hidden="true">
        {tone === 'success' ? '✓' : tone === 'error' ? '!' : 'i'}
      </span>
      <span className="app-notification-message">{notification.message}</span>
      <button onClick={() => setNotification(null)} aria-label="关闭通知">×</button>
    </div>
  );
}
