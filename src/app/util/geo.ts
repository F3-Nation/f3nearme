/**
 * Straight-line ("as the crow flies") distance in miles between two points.
 * Shared by the nearby list and the trip planner so both rank workouts the
 * same way.
 */
export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === lat2 && lon1 === lon2) {return 0;}
  const radlat1 = Math.PI * lat1 / 180;
  const radlat2 = Math.PI * lat2 / 180;
  const radtheta = Math.PI * (lon1 - lon2) / 180;
  let dist = Math.sin(radlat1) * Math.sin(radlat2) +
      Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
  if (dist > 1) {dist = 1;}
  dist = Math.acos(dist);
  dist = dist * 180 / Math.PI;
  return dist * 60 * 1.1515;
}
