import type { WeatherCurrent, WeatherForecastDay } from '../types';

const BASE = 'https://api.open-meteo.com/v1/forecast';

export async function fetchCurrentWeather(lat: number, lon: number): Promise<WeatherCurrent> {
  const url = new URL(BASE);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,wind_speed_10m,weather_code,is_day');
  url.searchParams.set('models', 'bom_access_global');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo current error: ${res.status}`);
  const data = await res.json() as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      wind_speed_10m: number;
      weather_code: number;
      is_day: number;
    };
  };
  return {
    tempC: data.current.temperature_2m,
    feelsLikeC: data.current.apparent_temperature,
    windKph: data.current.wind_speed_10m,
    weatherCode: data.current.weather_code,
    isDay: data.current.is_day === 1,
  };
}

export async function fetchWeatherForecast(lat: number, lon: number): Promise<WeatherForecastDay[]> {
  const url = new URL(BASE);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max');
  url.searchParams.set('timezone', 'Australia/Sydney');
  url.searchParams.set('forecast_days', '5');
  url.searchParams.set('models', 'bom_access_global');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo forecast error: ${res.status}`);
  const data = await res.json() as {
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weather_code: number[];
      precipitation_probability_max: number[];
    };
  };
  return data.daily.time.map((date, i) => ({
    date,
    highC: data.daily.temperature_2m_max[i] ?? 0,
    lowC: data.daily.temperature_2m_min[i] ?? 0,
    weatherCode: data.daily.weather_code[i] ?? 0,
    precipitationProbability: data.daily.precipitation_probability_max[i] ?? 0,
  }));
}

export async function geocodeSuburb(suburb: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(suburb)}&count=1&country=AU`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json() as { results?: Array<{ latitude: number; longitude: number }> };
  const first = data.results?.[0];
  if (!first) return null;
  return { lat: first.latitude, lon: first.longitude };
}
