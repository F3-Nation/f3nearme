import type {Beatdown} from '../pages/nearby/nearby.page';

/** A city that has at least one F3 workout, with a point to measure from */
export interface CityOption {
  city: string;
  regions: string[];
  lat: number;
  long: number;
}

/** Extract city and state/country from an address, e.g. 'Boise, ID' */
export function extractCity(address: string|null|undefined): string {
  if (!address) {return 'Unknown Location';}
  const parts = address.split(',').map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length >= 3) {return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;}
  if (parts.length === 2) {return `${parts[0]}, ${parts[1]}`;}
  if (parts.length === 1) {return parts[0];}
  return address;
}

/** Every city with workouts, alphabetical, pinned to its first workout's spot */
export function extractCities(beatdowns: Beatdown[]): CityOption[] {
  const byKey = new Map<string, CityOption>();
  for (const bd of beatdowns) {
    const city = extractCity(bd.address);
    const key = city.toLowerCase().replace(/\s+/g, ' ').trim();
    const region = bd.region || 'Unknown Region';
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {city, regions: [region], lat: bd.lat, long: bd.long});
    } else if (!existing.regions.includes(region)) {
      existing.regions.push(region);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.city.localeCompare(b.city));
}
