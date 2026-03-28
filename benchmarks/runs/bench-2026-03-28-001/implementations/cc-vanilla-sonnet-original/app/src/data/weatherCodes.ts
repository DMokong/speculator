export interface WeatherCodeInfo {
  label: string;
  icon: string;
}

export function getWeatherInfo(code: number): WeatherCodeInfo {
  if (code === 0) return { label: 'Clear sky', icon: '☀️' };
  if (code >= 1 && code <= 3) return { label: 'Partly cloudy', icon: '⛅' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: '🌫️' };
  if (code >= 51 && code <= 67) return { label: 'Rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: '❄️' };
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: '🌦️' };
  if (code >= 95 && code <= 99) return { label: 'Thunderstorm', icon: '⛈️' };
  return { label: 'Unknown', icon: '🌡️' };
}
