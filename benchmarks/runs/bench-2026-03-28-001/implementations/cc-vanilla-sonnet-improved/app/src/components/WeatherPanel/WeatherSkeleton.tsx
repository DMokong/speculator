export function WeatherSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-gray-700 rounded-full" />
        <div className="space-y-2">
          <div className="h-8 w-24 bg-gray-700 rounded" />
          <div className="h-4 w-32 bg-gray-700 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex-1 h-20 bg-gray-700 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
