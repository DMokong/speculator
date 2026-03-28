export function WeatherSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading weather">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 bg-gray-200 rounded-full" />
        <div className="space-y-2">
          <div className="h-10 bg-gray-200 rounded w-24" />
          <div className="h-4 bg-gray-200 rounded w-32" />
        </div>
      </div>
      <div className="h-4 bg-gray-200 rounded w-28" />
      <div className="flex gap-2 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 h-24 bg-gray-200 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
