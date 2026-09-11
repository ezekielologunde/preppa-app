/**
 * Location + proximity utilities.
 *
 * `captureCurrentLocation` reads the device's present location (web Geolocation API)
 * and returns both a readable "City, ST" label and the raw coordinates (the coords
 * drive nearby-cook filtering). Reverse geocoding uses BigDataCloud's free, key-less,
 * CORS endpoint; forward geocoding (address → coords, for kitchens) uses OpenStreetMap
 * Nominatim (also key-less). Both degrade gracefully.
 */

export interface LatLng { lat: number; lng: number }
export interface CapturedLocation extends LatLng { label: string; countryCode?: string }

export async function captureCurrentLocation(): Promise<CapturedLocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Location isn’t available on this device.');
  }
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => reject(new Error(err.code === 1 ? 'Location permission denied.' : 'Couldn’t get your location.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
  const { latitude, longitude } = pos.coords;
  let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
  let countryCode: string | undefined;
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
    );
    const j: any = await res.json();
    const city = j.city || j.locality || j.principalSubdivision || '';
    const state = typeof j.principalSubdivisionCode === 'string' ? j.principalSubdivisionCode.split('-').pop() : '';
    const name = [city, state].filter(Boolean).join(', ');
    if (name) label = name;
    if (typeof j.countryCode === 'string' && j.countryCode) countryCode = j.countryCode.toUpperCase();
  } catch {
    /* keep coordinate label */
  }
  return { label, lat: latitude, lng: longitude, countryCode };
}

/** Reverse-geocode coords to a neighborhood/locality string (for prefilling the
 *  application's neighborhood field). Null on failure. */
export async function reverseNeighborhood(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
    );
    const j: any = await res.json();
    return j.locality || j.city || j.principalSubdivision || null;
  } catch {
    return null;
  }
}

/** Forward-geocode an address/area string to coords (Nominatim/OSM, key-less). Null on failure. */
export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const r = await geocodeAddressDetailed(query);
  return r ? { lat: r.lat, lng: r.lng } : null;
}

/** Like `geocodeAddress`, but also returns the ISO-2 country code (for tax jurisdiction). */
export async function geocodeAddressDetailed(query: string): Promise<CapturedLocation | null> {
  const q = (query || '').trim();
  if (q.length < 3) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json' } },
    );
    const j: any = await res.json();
    const hit = Array.isArray(j) ? j[0] : null;
    if (hit?.lat && hit?.lon) {
      const countryCode = typeof hit.address?.country_code === 'string' ? hit.address.country_code.toUpperCase() : undefined;
      return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), label: q, countryCode };
    }
  } catch {
    /* geocode failed */
  }
  return null;
}

/** Great-circle distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Human distance label, e.g. "800 m" / "2.3 km". */
export function distanceLabel(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
