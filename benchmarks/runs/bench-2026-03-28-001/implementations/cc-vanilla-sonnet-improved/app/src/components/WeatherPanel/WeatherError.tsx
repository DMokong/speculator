export function WeatherError() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-red-400">
      <span className="text-3xl">⚠️</span>
      <p className="text-sm">Failed to load weather data.</p>
      <p className="text-xs text-gray-500">Check your connection and try refreshing.</p>
    </div>
  );
}
