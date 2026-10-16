export type NotificationTone = 'info' | 'success' | 'error';

export interface NotificationDetail {
  message: string;
  tone?: NotificationTone;
  duration?: number;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function notify(
  message: string,
  tone: NotificationTone = 'info',
  duration = tone === 'error' ? 4200 : 2200,
) {
  window.dispatchEvent(new CustomEvent<NotificationDetail>('mac-editor:notify', {
    detail: { message, tone, duration },
  }));
}
