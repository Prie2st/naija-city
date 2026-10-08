// Annual rainfall and storm-day counts from the weather model (no city simulation needed).
import { updateWeather } from '../../shared/simulation/weather';
import { weatherState } from '../../shared/simulation/infrastructure-config';
for (const seed of [731, 1009, 4242]) {
  const city: any = { seed, tick: 0, weather: weatherState() };
  let total = 0, heavy = 0, extreme = 0, wet = 0;
  const years = 20;
  for (let d = 0; d < 360 * years; d++) { city.tick++; updateWeather(city); total += city.weather.rainfall; if (city.weather.kind === 'heavy-rain') heavy++; if (city.weather.kind === 'extreme-rain') extreme++; if (city.weather.rainfall > 0) wet++; }
  console.log(seed, 'mm/yr', Math.round(total / years), 'heavy days/yr', (heavy / years).toFixed(1), 'extreme days/yr', (extreme / years).toFixed(1), 'rain days/yr', (wet / years).toFixed(0));
}
