import type { WeatherCurrent, WeatherForecastDay } from '../types';

const HEAVY_RAIN_CODES = new Set([61, 63, 65, 66, 67, 80, 81, 82]);
const THUNDERSTORM_CODES = new Set([95, 96, 99]);
const PRECIPITATION_THRESHOLD = 60;

function isSevereCode(code: number): boolean {
  return HEAVY_RAIN_CODES.has(code) || THUNDERSTORM_CODES.has(code);
}

export function shouldRecommendEarlierDeparture(
  forecast: WeatherForecastDay[],
  current: WeatherCurrent
): { recommend: boolean; reason: string } {
  if (isSevereCode(current.weatherCode)) {
    const label = THUNDERSTORM_CODES.has(current.weatherCode) ? 'Thunderstorm' : 'Heavy rain';
    return {
      recommend: true,
      reason: `${label} currently — consider an earlier service.`,
    };
  }

  const today = forecast[0];
  if (
    today &&
    today.precipitationProbability > PRECIPITATION_THRESHOLD &&
    isSevereCode(today.weatherCode)
  ) {
    const label = THUNDERSTORM_CODES.has(today.weatherCode) ? 'Thunderstorm' : 'Heavy rain';
    return {
      recommend: true,
      reason: `${label} forecast with ${today.precipitationProbability}% probability — consider an earlier service.`,
    };
  }

  return { recommend: false, reason: '' };
}
