interface Props {
  lastUpdated: Date | null
}

const TEN_MINUTES_MS = 10 * 60 * 1000

export function StalenessWarning({ lastUpdated }: Props) {
  if (!lastUpdated) return null
  const isStale = Date.now() - lastUpdated.getTime() > TEN_MINUTES_MS
  if (!isStale) return null
  return (
    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
      Data may be outdated
    </div>
  )
}
