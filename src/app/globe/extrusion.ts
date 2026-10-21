import { BufferAttribute, BufferGeometry, ShapeUtils, Vector2, Vector3 } from 'three';
import type { CountryFeature } from '../data/boundaries';
import { lonLatToVector3 } from './geo';

// Lesson 15: countries standing up off the globe, in ONE geometry, in one of two shapes:
//
//   'cylinders'  a round column at each country's centre, every column the same footprint. Volume then follows the
//                value: a column twice as tall holds twice as much. What's shown now.
//   'spikes'  the same idea with square columns, thinner: the first try at equal footprints.
//   'prisms'  each country's own outline, raised. The first version: its volume is area × height, so big countries look
//             big for their size alone (China, Russia, Canada) and small ones vanish. Kept to compare, not shown.
//
// Either way the geometry is built at height 0 (every vertex on the unit sphere) and carries:
//   aTop      0 = on the ground, 1 = on top
//   aCountry  the country's number, as in the ID map (features[0] is 1)
//   aEdge     where on its face a point is, 0…1 across and 0…1 up: the shader inks the pixels near 0 and 1, which
//             outlines every face at a width in screen pixels. A face with a constant 0.5 gets no line that way.
// The vertex shader (extrusion-material.ts) lifts the aTop = 1 vertices by the country's height, read from a 256 × 1
// texture. So a new year uploads 1 kB of heights, and the geometry is never rebuilt.
export type ExtrusionShape = 'cylinders' | 'spikes' | 'prisms';

// A column's half-width, in globe radii: 0.012 ≈ 76 km, so it spans ~150 km. Thin enough that Europe's columns stand
// apart, wide enough to see at the default zoom.
const SPIKE_HALF_WIDTH = 0.012;
// A cylinder's radius: 0.022 ≈ 140 km, so ~280 km across. Beefier than the squares, still clear of most neighbours.
const CYLINDER_RADIUS = 0.022;
// Sides around a cylinder: 24 reads as round at any zoom the globe allows
const CYLINDER_SIDES = 24;

// Prisms: triangles are split until no edge spans more than this many degrees. A cap is flat triangles between points ON
// the sphere: Russia's, triangulated as-is, would be a few huge flat triangles sinking deep under the curve. At 2°, a
// triangle's middle sits at most ~0.00015 radii (1 km) below the sphere.
const MAX_EDGE_DEG = 2;

const cache: Record<ExtrusionShape, WeakMap<CountryFeature[], BufferGeometry>> = { cylinders: new WeakMap(), spikes: new WeakMap(), prisms: new WeakMap() };
const builders: Record<ExtrusionShape, (features: CountryFeature[]) => BufferGeometry> = { cylinders: (f) => cylinders(f), spikes: (f) => spikes(f), prisms: (f) => prisms(f) };

export function extrusionGeometry(features: CountryFeature[], shape: ExtrusionShape): BufferGeometry {
  let geometry = cache[shape].get(features);
  if (!geometry) cache[shape].set(features, (geometry = builders[shape](features)));
  return geometry;
}

// The vertex arrays, and one function to add a vertex to them
function buffers() {
  const position: number[] = [], normal: number[] = [], top: number[] = [], country: number[] = [], edge: number[] = [];
  const add = (p: Vector3, n: Vector3, isTop: number, id: number, u: number, v: number) => {
    position.push(p.x, p.y, p.z);
    normal.push(n.x, n.y, n.z);
    top.push(isTop);
    country.push(id);
    edge.push(u, v);
  };
  const geometry = () => new BufferGeometry()
    .setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
    .setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3))
    .setAttribute('aTop', new BufferAttribute(new Float32Array(top), 1))
    .setAttribute('aCountry', new BufferAttribute(new Float32Array(country), 1))
    .setAttribute('aEdge', new BufferAttribute(new Float32Array(edge), 2));
  return { add, geometry };
}

// A country's centre (its label point) and two directions flat along the ground there: east and north
function groundFrame(feature: CountryFeature) {
  const centre = lonLatToVector3(...feature.properties.label, 1);
  const east = new Vector3().crossVectors(new Vector3(0, 1, 0), centre);
  if (east.lengthSq() < 1e-9) east.set(1, 0, 0); // a centre at a pole has no east: pick one
  east.normalize();
  return { centre, east, north: new Vector3().crossVectors(centre, east) };
}

// --- cylinders ----------------------------------------------------------------------------------------------------------
// A round column at each country's label point: a ring of CYLINDER_SIDES quads for the side, a fan of triangles for the top.
// Face coordinates for the outline: the side runs 0 → 1 up (v) with u fixed at 0.5, so it's outlined along the top rim and
// the ground, not at every one of its 24 seams; the top runs from 0.5 at the centre to 1 at the rim, so only the rim is
// inked. The side's silhouette, where it turns away from the camera, is outlined in the shader from its normal.
function cylinders(features: CountryFeature[]): BufferGeometry {
  const { add, geometry } = buffers();

  features.forEach((feature, i) => {
    const id = i + 1;
    const { centre, east, north } = groundFrame(feature);
    // Around the rim: the point on the ground, and the side's normal there (smooth: pointing straight out from the axis)
    const rim = Array.from({ length: CYLINDER_SIDES + 1 }, (_, k) => {
      const angle = (k / CYLINDER_SIDES) * Math.PI * 2;
      const out = east.clone().multiplyScalar(Math.cos(angle)).addScaledVector(north, Math.sin(angle));
      return { point: centre.clone().addScaledVector(out, CYLINDER_RADIUS).normalize(), out };
    });

    for (let k = 0; k < CYLINDER_SIDES; k++) {
      const a = rim[k], b = rim[k + 1];
      // The side: a quad from a to b, ground to top
      add(a.point, a.out, 0, id, 0.5, 0); add(b.point, b.out, 0, id, 0.5, 0); add(b.point, b.out, 1, id, 0.5, 1);
      add(a.point, a.out, 0, id, 0.5, 0); add(b.point, b.out, 1, id, 0.5, 1); add(a.point, a.out, 1, id, 0.5, 1);
      // The top: a slice of the fan, centre → a → b
      add(centre, centre, 1, id, 0.5, 0.5); add(a.point, centre, 1, id, 0.5, 1); add(b.point, centre, 1, id, 0.5, 1);
    }
  });

  return geometry();
}

// --- spikes -------------------------------------------------------------------------------------------------------------
// A square column at each country's label point (Natural Earth's, inside the country), its sides facing east, north, west
// and south. Five faces: the cap and four walls, each with its own 0…1 face coordinates for the outline.
function spikes(features: CountryFeature[]): BufferGeometry {
  const { add, geometry } = buffers();

  features.forEach((feature, i) => {
    const id = i + 1;
    const { centre, east, north } = groundFrame(feature);

    // A corner: s, t = ±1 along east and north, pushed back onto the sphere
    const corner = (s: number, t: number) =>
      centre.clone().addScaledVector(east, s * SPIKE_HALF_WIDTH).addScaledVector(north, t * SPIKE_HALF_WIDTH).normalize();
    const sw = corner(-1, -1), se = corner(1, -1), ne = corner(1, 1), nw = corner(-1, 1);

    // The cap, two triangles; its face coordinates run west → east and south → north
    add(sw, centre, 1, id, 0, 0); add(se, centre, 1, id, 1, 0); add(ne, centre, 1, id, 1, 1);
    add(sw, centre, 1, id, 0, 0); add(ne, centre, 1, id, 1, 1); add(nw, centre, 1, id, 0, 1);

    // The walls: from corner a to corner b around the column; u runs a → b, v runs ground → top
    const wall = (a: Vector3, b: Vector3, out: Vector3) => {
      add(a, out, 0, id, 0, 0); add(b, out, 0, id, 1, 0); add(b, out, 1, id, 1, 1);
      add(a, out, 0, id, 0, 0); add(b, out, 1, id, 1, 1); add(a, out, 1, id, 0, 1);
    };
    wall(sw, se, north.clone().negate()); // south face
    wall(se, ne, east);                   // east face
    wall(ne, nw, north);                  // north face
    wall(nw, sw, east.clone().negate());  // west face
  });

  return geometry();
}

// --- prisms -------------------------------------------------------------------------------------------------------------
function prisms(features: CountryFeature[]): BufferGeometry {
  const { add, geometry } = buffers();
  const at = (p: Vector2) => lonLatToVector3(p.x, p.y, 1);

  // The cap: a triangle in lon/lat, split at its edges' midpoints (into four) until every edge is short enough.
  // Face coordinates fixed at 0.5: no outline drawn across a cap (it would show every small triangle).
  const cap = (a: Vector2, b: Vector2, c: Vector2, id: number) => {
    if (Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) > MAX_EDGE_DEG) {
      const ab = a.clone().lerp(b, 0.5), bc = b.clone().lerp(c, 0.5), ca = c.clone().lerp(a, 0.5);
      cap(a, ab, ca, id); cap(ab, b, bc, id); cap(ca, bc, c, id); cap(ab, bc, ca, id);
      return;
    }
    for (const p of [a, b, c]) { const v = at(p); add(v, v, 1, id, 0.5, 0.5); } // a cap faces straight out: normal = position
  };

  // A wall: one ring edge from the ground to the top, split into short pieces like the cap, so its top edge follows the
  // cap's curved rim. Normal across the edge. Face coordinates: u fixed at 0.5 (no lines between the pieces), v = up, so
  // the outline runs along the rim at the top and along the ground.
  const wall = (a: Vector2, b: Vector2, id: number) => {
    if (a.distanceTo(b) > MAX_EDGE_DEG) {
      const m = a.clone().lerp(b, 0.5);
      wall(a, m, id); wall(m, b, id);
      return;
    }
    const pa = at(a), pb = at(b);
    const n = new Vector3().crossVectors(pb.clone().sub(pa), pa.clone().add(pb)).normalize();
    add(pa, n, 0, id, 0.5, 0); add(pb, n, 0, id, 0.5, 0); add(pb, n, 1, id, 0.5, 1);
    add(pa, n, 0, id, 0.5, 0); add(pb, n, 1, id, 0.5, 1); add(pa, n, 1, id, 0.5, 1);
  };

  features.forEach((feature, i) => {
    const id = i + 1;
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const rings of polygons) {
      // GeoJSON rings repeat their first point at the end; earcut wants each point once
      const points = rings.map(ring => ring.slice(0, -1).map(([lon, lat]) => new Vector2(lon, lat))).filter(r => r.length >= 3);
      if (!points.length) continue;
      const [outline, ...holes] = points;

      // Earcut (inside ShapeUtils): the outline and its holes (Lesotho in South Africa) → triangles, as point indices
      // into [outline, ...holes] laid end to end. Done in lon/lat, where the shapes are plain flat polygons.
      const all = points.flat();
      for (const [a, b, c] of ShapeUtils.triangulateShape(outline, holes)) cap(all[a], all[b], all[c], id);

      for (const ring of points) {
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k], b = ring[(k + 1) % ring.length];
          // No wall along a cut: Natural Earth splits shapes at the 180° meridian (Russia's Chukotka, Fiji) and closes
          // Antarctica along the South Pole's edge of the map. Those edges are seams in the data, not coastlines; a wall
          // there would stand in the middle of a country.
          if (Math.abs(a.x) > 179.99 && Math.abs(b.x) > 179.99) continue;
          if (a.y < -89.99 && b.y < -89.99) continue;
          wall(a, b, id);
        }
      }
    }
  });

  return geometry();
}
