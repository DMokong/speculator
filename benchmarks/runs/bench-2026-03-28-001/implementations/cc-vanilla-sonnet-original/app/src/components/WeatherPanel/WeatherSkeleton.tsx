export function WeatherSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-16 bg-gray-700 rounded-lg" />
      <div className="h-6 bg-gray-700 rounded-lg w-2/3" />
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex-1 h-20 bg-gray-700 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
