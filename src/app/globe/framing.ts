import { geoContains, geoDistance } from 'd3-geo';
import type { Position } from 'geojson';
import type { CountryFeature } from '../data/boundaries';

export type CameraTarget = { lon: number; lat: number; distance: number };

// Where the camera should be so a country is centred and fills `share` of the screen (lesson 10).
//
// Centre: the country's label point (Natural Earth's), which sits on its main body. A centroid of all its parts would put
// France in the Atlantic, between Paris and French Guiana.
// Size: the main body only (the polygon holding the label point), measured as an angle on the sphere: θ = the farthest
// outline point from the centre. Overseas parts don't count, or France would be framed as wide as the Atlantic.
//
// Distance: from the centre of the globe, a point θ away from the point under the camera appears at
//   tan α = sin θ / (D − cos θ)
// and we want 2·tan α to be `share` of the screen's height in tangent units (2·tan(fov/2)). Solving for D:
//   D = cos θ + sin θ / (share · tan(fov/2))
export function frameCountry(feature: CountryFeature, fovDegrees: number, aspect: number, share = 0.3, limits = { min: 1.8, max: 4 }): CameraTarget {
  const [lon, lat] = feature.properties.label;
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const main = polygons.find(p => geoContains({ type: 'Polygon', coordinates: p }, [lon, lat])) ?? largest(polygons);
  const theta = Math.max(...main[0].map(point => geoDistance([lon, lat], point as [number, number]))); // radians on the unit sphere

  // On a portrait screen the width is the tighter side: use the horizontal field of view instead
  const halfFov = (fovDegrees * Math.PI) / 360;
  const tanHalf = aspect < 1 ? Math.tan(halfFov) * aspect : Math.tan(halfFov);
  const distance = Math.cos(theta) + Math.sin(theta) / (share * tanHalf);
  return { lon, lat, distance: Math.min(limits.max, Math.max(limits.min, distance)) };
}

function largest(polygons: Position[][][]) { return polygons.reduce((a, b) => (b[0].length > a[0].length ? b : a)); }
