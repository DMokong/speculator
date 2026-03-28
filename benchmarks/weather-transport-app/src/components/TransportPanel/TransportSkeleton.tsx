export function TransportSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading departures">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="h-8 w-8 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-14 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
