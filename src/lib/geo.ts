/**
 * Capture the user's present location (web Geolocation API) and turn it into a
 * readable "City, ST" label. Reverse geocoding uses BigDataCloud's free,
 * key-less, CORS-enabled client endpoint; if it fails we fall back to coordinates.
 * Throws a friendly Error when geolocation is unavailable or the user denies it —
 * callers catch and offer the manual area picker.
 */
export async function captureCurrentLocation(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Location isn’t available on this device.');
  }
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      reject(new Error(err.code === 1 ? 'Location permission denied.' : 'Couldn’t get your location.'));
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  });
  const { latitude, longitude } = pos.coords;
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
    );
    const j: any = await res.json();
    const city = j.city || j.locality || j.principalSubdivision || '';
    const state = typeof j.principalSubdivisionCode === 'string' ? j.principalSubdivisionCode.split('-').pop() : '';
    const name = [city, state].filter(Boolean).join(', ');
    if (name) return name;
  } catch {
    /* reverse geocode failed — fall through to coordinates */
  }
  return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
}
