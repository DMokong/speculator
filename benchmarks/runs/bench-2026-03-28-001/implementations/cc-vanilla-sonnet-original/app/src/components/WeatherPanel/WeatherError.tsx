export function WeatherError() {
  return (
    <div className="flex items-center justify-center h-40 text-red-400 text-sm text-center px-4">
      <p>Unable to load weather data. Check your connection and try refreshing.</p>
    </div>
  );
}
