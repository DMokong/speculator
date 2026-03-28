import { formatTime } from '../../utils/time'

interface Props {
  lastUpdated: Date | null
}

export function LastUpdated({ lastUpdated }: Props) {
  if (!lastUpdated) return null
  return (
    <span className="text-xs text-gray-500">
      Last updated {formatTime(lastUpdated)}
    </span>
  )
}
