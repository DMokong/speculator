export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  if (hour >= 18 && hour < 21) return 'Good evening'
  return 'Good night'
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function formatHHMM(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function getDayLabel(isoDate: string): string {
  const today = new Date()
  const date = new Date(isoDate + 'T00:00:00')
  const todayStr = today.toISOString().split('T')[0]
  if (isoDate === todayStr) return 'Today'
  return date.toLocaleDateString('en-AU', { weekday: 'short' })
}
