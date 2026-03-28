const SYD_TZ = 'Australia/Sydney';

export function formatTime(isoString: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYD_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoString));
}

export function getDayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYD_TZ,
    weekday: 'short',
  }).format(new Date(isoDate));
}

export function getGreeting(): string {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: SYD_TZ,
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
    10
  );
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

export function formatUpdatedTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYD_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(timestamp));
}
