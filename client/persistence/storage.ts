import type { City } from '../../shared/types/city';
import { decodeCity } from '../../shared/simulation/save-format';
export interface CityRepository { save(city: City): void; load(): City | null }
const KEY = 'naija-city-v9';
export class LocalCityRepository implements CityRepository {
  save(city: City) { localStorage.setItem(KEY, JSON.stringify(city)); }
  load(): City | null {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem('naija-city-v8') ?? localStorage.getItem('naija-city-v7') ?? localStorage.getItem('naija-city-v6') ?? localStorage.getItem('naija-city-v5') ?? localStorage.getItem('naija-city-v4') ?? localStorage.getItem('naija-city-v3') ?? localStorage.getItem('naija-city-v2') ?? localStorage.getItem('naija-city-v1');
    return raw === null ? null : decodeCity(JSON.parse(raw));
  }
}
