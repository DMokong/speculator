import type { WeatherCurrent, WeatherDay } from '../types';

const BASE = 'https://api.open-meteo.com/v1/forecast';

export async function fetchCurrentWeather(lat: number, lon: number): Promise<WeatherCurrent> {
  const url = new URL(BASE);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,wind_speed_10m,weather_code,precipitation_probability');
  url.searchParams.set('models', 'bom_access_global');
  url.searchParams.set('wind_speed_unit', 'kmh');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo current: ${res.status}`);
  const json = await res.json() as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      wind_speed_10m: number;
      weather_code: number;
      precipitation_probability: number;
    };
  };
  const c = json.current;
  return {
    temperatureC: c.temperature_2m,
    feelsLikeC: c.apparent_temperature,
    windSpeedKmh: c.wind_speed_10m,
    weatherCode: c.weather_code,
    precipitationProbability: c.precipitation_probability,
  };
}

export async function fetchForecast(lat: number, lon: number): Promise<WeatherDay[]> {
  const url = new URL(BASE);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max');
  url.searchParams.set('models', 'bom_access_global');
  url.searchParams.set('timezone', 'Australia/Sydney');
  url.searchParams.set('forecast_days', '5');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo forecast: ${res.status}`);
  const json = await res.json() as {
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weather_code: number[];
      precipitation_probability_max: number[];
    };
  };
  const d = json.daily;
  return d.time.map((date, i) => ({
    date,
    maxC: d.temperature_2m_max[i],
    minC: d.temperature_2m_min[i],
    weatherCode: d.weather_code[i],
    precipProbability: d.precipitation_probability_max[i],
  }));
}
