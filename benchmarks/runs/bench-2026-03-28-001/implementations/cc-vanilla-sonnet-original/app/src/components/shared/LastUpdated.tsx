import { formatLastUpdated } from '../../utils/time';

interface Props {
  date: Date;
}

export function LastUpdated({ date }: Props) {
  return (
    <p className="text-xs text-gray-500">
      Last updated {formatLastUpdated(date)}
    </p>
  );
}
