/**
 * Geographic utilities. Pure functions only - no I/O, deterministic.
 */

/** Earth radius in meters (WGS-84 mean). */
export const EARTH_RADIUS_M = 6_371_008.8;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Haversine great-circle distance in meters between two lat/lng points.
 * Reference implementation: R.W. Sinnott, "Virtues of the Haversine", Sky & Telescope, 1984.
 *
 * @param a Point A
 * @param b Point B
 * @returns Distance in meters (>= 0)
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dPhi = toRad(b.lat - a.lat);
  const dLambda = toRad(b.lng - a.lng);

  const sinDPhi = Math.sin(dPhi / 2);
  const sinDLambda = Math.sin(dLambda / 2);

  const h =
    sinDPhi * sinDPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinDLambda * sinDLambda;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

/**
 * Bearing in degrees [0, 360) from point A to point B.
 */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLambda = toRad(b.lng - a.lng);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

/** Round to N decimals (used in tests + API). */
export function round(value: number, decimals = 2): number {
  const m = Math.pow(10, decimals);
  return Math.round(value * m) / m;
}