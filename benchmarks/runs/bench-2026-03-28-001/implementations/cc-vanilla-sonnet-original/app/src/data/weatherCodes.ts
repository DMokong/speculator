import type { WeatherCodeInfo } from '../types'

export const weatherCodes: Record<number, WeatherCodeInfo> = {
  0:  { label: 'Clear sky', icon: '☀️' },
  1:  { label: 'Mainly clear', icon: '🌤️' },
  2:  { label: 'Partly cloudy', icon: '⛅' },
  3:  { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Depositing rime fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Moderate drizzle', icon: '🌦️' },
  55: { label: 'Dense drizzle', icon: '🌧️' },
  56: { label: 'Light freezing drizzle', icon: '🌨️' },
  57: { label: 'Heavy freezing drizzle', icon: '🌨️' },
  61: { label: 'Slight rain', icon: '🌧️' },
  63: { label: 'Moderate rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Light freezing rain', icon: '🌨️' },
  67: { label: 'Heavy freezing rain', icon: '🌨️' },
  71: { label: 'Slight snowfall', icon: '❄️' },
  73: { label: 'Moderate snowfall', icon: '❄️' },
  75: { label: 'Heavy snowfall', icon: '❄️' },
  77: { label: 'Snow grains', icon: '❄️' },
  80: { label: 'Slight showers', icon: '🌦️' },
  81: { label: 'Moderate showers', icon: '🌧️' },
  82: { label: 'Violent showers', icon: '⛈️' },
  85: { label: 'Slight snow showers', icon: '🌨️' },
  86: { label: 'Heavy snow showers', icon: '🌨️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm with slight hail', icon: '⛈️' },
  99: { label: 'Thunderstorm with heavy hail', icon: '⛈️' },
}

export const DEFAULT_WEATHER_CODE_INFO: WeatherCodeInfo = {
  label: 'Unknown conditions',
  icon: '☁️',
}

export function getWeatherCodeInfo(code: number): WeatherCodeInfo {
  return weatherCodes[code] ?? DEFAULT_WEATHER_CODE_INFO
}
