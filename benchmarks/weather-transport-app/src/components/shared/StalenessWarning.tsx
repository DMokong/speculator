import { useEffect, useState } from 'react';

const STALE_MS = 10 * 60 * 1000;

interface Props {
  lastUpdatedAt: number | null;
}

export function StalenessWarning({ lastUpdatedAt }: Props) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    function check() {
      setStale(!!lastUpdatedAt && Date.now() - lastUpdatedAt > STALE_MS);
    }
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [lastUpdatedAt]);

  if (!stale) return null;
  return (
    <div
      role="alert"
      className="mb-2 rounded bg-yellow-100 px-3 py-2 text-sm font-medium text-yellow-800 border border-yellow-300"
    >
      Data may be out of date.
    </div>
  );
}
