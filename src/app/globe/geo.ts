import { Vector3 } from 'three';

const RAD = Math.PI / 180;

// [lon, lat] in degrees → a point on a sphere. The one formula the globe is built on.
// Three.js is Y-up: lat 90° is +Y (north pole). lon 0° (Greenwich) faces +Z, the default camera direction; lon 90° E is +X.
export function lonLatToVector3(lon: number, lat: number, radius = 1, target = new Vector3()) {
  const phi = lat * RAD, lambda = lon * RAD;
  return target.set(radius * Math.cos(phi) * Math.sin(lambda), radius * Math.sin(phi), radius * Math.cos(phi) * Math.cos(lambda));
}

// Lines given as [lon, lat] paths (country borders) → pairs of points on the sphere for LineSegments.
// Long straight edges (the 49th parallel between the USA and Canada is a handful of points) are cut into steps of at most
// `maxStep` degrees, so they follow the curve instead of cutting through the sphere as a chord.
export function sphereLinePositions(lines: number[][][], radius = 1, maxStep = 1) {
  const out: number[] = [];
  const a = new Vector3(), b = new Vector3();
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [lon1, lat1] = line[i], [lon2, lat2] = line[i + 1];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(lon2 - lon1), Math.abs(lat2 - lat1)) / maxStep));
      for (let s = 0; s < steps; s++) {
        lonLatToVector3(lon1 + ((lon2 - lon1) * s) / steps, lat1 + ((lat2 - lat1) * s) / steps, radius, a);
        lonLatToVector3(lon1 + ((lon2 - lon1) * (s + 1)) / steps, lat1 + ((lat2 - lat1) * (s + 1)) / steps, radius, b);
        out.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  return new Float32Array(out);
}

// Lines of latitude and longitude every `step` degrees, as pairs of points for LineSegments.
// Lines sit exactly on the surface (radius 1); the Earth material's polygon offset keeps them from flickering against it.
// Each line is cut into short segments so it follows the curve instead of cutting through the sphere.
export function graticulePositions(step = 15, radius = 1, segment = 2) {
  const out: number[] = [];
  const push = (lon1: number, lat1: number, lon2: number, lat2: number) => {
    const a = lonLatToVector3(lon1, lat1, radius), b = lonLatToVector3(lon2, lat2, radius);
    out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  };
  for (let lat = -90 + step; lat < 90; lat += step) for (let lon = -180; lon < 180; lon += segment) push(lon, lat, lon + segment, lat);
  for (let lon = -180; lon < 180; lon += step) for (let lat = -90; lat < 90; lat += segment) push(lon, lat, lon, lat + segment);
  return new Float32Array(out);
}
