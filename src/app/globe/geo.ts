import { Vector3 } from 'three';

const RAD = Math.PI / 180;

// [lon, lat] in degrees → a point on a sphere. The one formula the globe is built on.
// Three.js is Y-up: lat 90° is +Y (north pole). lon 0° (Greenwich) faces +Z, the default camera direction; lon 90° E is +X.
export function lonLatToVector3(lon: number, lat: number, radius = 1, target = new Vector3()) {
  const phi = lat * RAD, lambda = lon * RAD;
  return target.set(radius * Math.cos(phi) * Math.sin(lambda), radius * Math.sin(phi), radius * Math.cos(phi) * Math.cos(lambda));
}

// Lines of latitude and longitude every `step` degrees, as pairs of points for LineSegments.
// Each line is cut into short segments so it follows the curve instead of cutting through the sphere.
export function graticulePositions(step = 15, radius = 1.001, segment = 2) {
  const out: number[] = [];
  const push = (lon1: number, lat1: number, lon2: number, lat2: number) => {
    const a = lonLatToVector3(lon1, lat1, radius), b = lonLatToVector3(lon2, lat2, radius);
    out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  };
  for (let lat = -90 + step; lat < 90; lat += step) for (let lon = -180; lon < 180; lon += segment) push(lon, lat, lon + segment, lat);
  for (let lon = -180; lon < 180; lon += step) for (let lat = -90; lat < 90; lat += segment) push(lon, lat, lon, lat + segment);
  return new Float32Array(out);
}
