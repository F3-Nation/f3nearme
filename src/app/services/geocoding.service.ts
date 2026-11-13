import {Injectable} from '@angular/core';

/** A place the user can point a trip at */
export interface GeocodeResult {
  /** Short, human label ("Charlotte, NC") */
  label: string;
  /** The full matched address */
  placeName: string;
  lat: number;
  long: number;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: Record<string, string>;
}

/**
 * Address lookup via OpenStreetMap's Nominatim. Free and keyless, but its
 * usage policy forbids per-keystroke autocomplete and asks for at most one
 * request a second, so callers only search on an explicit submit.
 */
@Injectable({providedIn: 'root'})
export class GeocodingService {
  private lastRequestAt = 0;

  async search(query: string): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < 3) {return [];}

    // pace requests to the policy's one-per-second
    const wait = this.lastRequestAt + 1000 - Date.now();
    if (wait > 0) {await new Promise(resolve => setTimeout(resolve, wait));}
    this.lastRequestAt = Date.now();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '6');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('q', q);

    const response = await fetch(url.toString(), {headers: {Accept: 'application/json'}});
    if (!response.ok) {
      throw new Error(`Address lookup failed (${response.status})`);
    }
    const results = await response.json() as NominatimResult[];
    return results.map(r => ({
      label: shortLabel(r),
      placeName: r.display_name,
      lat: Number(r.lat),
      long: Number(r.lon),
    })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.long));
  }
}

/** "Charlotte, NC" style label from the address parts, falling back to the name */
function shortLabel(r: NominatimResult): string {
  const a = r.address ?? {};
  const locality = a.city || a.town || a.village || a.hamlet || a.municipality || a.county;
  const state = a['ISO3166-2-lvl4']?.split('-')[1] || a.state;
  const street = a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road;
  const parts = [r.name && r.name !== locality ? r.name : street, locality, state]
      .filter(Boolean);
  if (parts.length === 0) {return r.display_name.split(',').slice(0, 2).join(',').trim();}
  return parts.join(', ');
}
