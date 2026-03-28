import { formatUpdatedTime } from '../../utils/time';

interface Props {
  lastUpdatedAt: number | null;
}

export function LastUpdated({ lastUpdatedAt }: Props) {
  if (!lastUpdatedAt) return null;
  return (
    <p className="mt-3 text-xs text-gray-400">
      Updated {formatUpdatedTime(lastUpdatedAt)}
    </p>
  );
}
