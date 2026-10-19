import type { Position } from 'geojson';
import type { CountryFeature } from '../data/boundaries';

// The ID map: a world image where each pixel holds the number of the country it belongs to.
// 0 = ocean, 1 = features[0], 2 = features[1]… One byte per pixel, so up to 255 countries (we have 240).
// The globe's shader reads it to know which country it's drawing (lesson 05), and picking reads it to know what's under the pointer (lesson 06).
//
// Equirectangular layout: column = longitude, row = latitude. Row 0 is the north edge (lat 90°), column 0 is lon -180°.
//
// Why not draw it with D3 on a <canvas>? Canvas anti-aliases every edge: a border pixel between country 12 and country 40
// comes out as a blend, which reads as country 26. Here each pixel is fully inside one country or not, with no blending.

export function rasterizeIds(features: CountryFeature[], width: number, height: number): Uint8Array {
  const ids = new Uint8Array(width * height);
  const x = (lon: number) => ((lon + 180) / 360) * width;
  const y = (lat: number) => ((90 - lat) / 180) * height;

  features.forEach((feature, i) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const rings = polygons.flat(); // outer rings and holes together: the even-odd rule below handles holes (Lesotho inside South Africa)
    fillRings(ids, rings, i + 1, width, height, x, y);
  });

  // Microstates are smaller than a pixel (one pixel ≈ 10 km at the equator), so often no pixel centre falls inside them.
  // Each gets its label pixel, in a second pass so the surrounding country (Italy around the Vatican) can't paint over it.
  // Never taking another country's last pixel: Saint-Martin and Sint Maarten share an island, and one pixel.
  const pixels = new Uint32Array(features.length + 1);
  for (const id of ids) pixels[id]++;
  const NEIGHBOURS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  features.forEach((feature, i) => {
    if (pixels[i + 1]) return;
    const [lon, lat] = feature.properties.label;
    const row = Math.floor(y(lat)), col = Math.floor(x(lon));
    const pixel = NEIGHBOURS.map(([dc, dr]) => clamp(row + dr, height) * width + clamp(col + dc, width)).find(p => pixels[ids[p]] > 1 || ids[p] === 0);
    if (pixel === undefined) return; // 9 neighbouring single-pixel countries: doesn't happen with this data
    pixels[ids[pixel]]--;
    pixels[i + 1]++;
    ids[pixel] = i + 1;
  });
  return ids;
}

// Lesson 06: the country number at a [lon, lat] (0 = ocean). The same pixel the shader samples, read from the CPU copy:
// no GPU readback, so picking costs a few multiplications, not a stall.
export function idAt(ids: Uint8Array, width: number, height: number, lon: number, lat: number) {
  return ids[clamp(Math.floor(((90 - lat) / 180) * height), height) * width + clamp(Math.floor(((lon + 180) / 360) * width), width)];
}

const clamp = (v: number, size: number) => Math.max(0, Math.min(size - 1, v));

// Scanline fill: for each pixel row, find where the row's centre line crosses the ring edges, sort the crossings,
// and fill between pairs (inside from the 1st to the 2nd crossing, outside to the 3rd, inside to the 4th…).
function fillRings(ids: Uint8Array, rings: Position[][], id: number, width: number, height: number, x: (lon: number) => number, y: (lat: number) => number) {
  type Edge = { x1: number; y1: number; x2: number; y2: number };
  const edges: Edge[] = [];
  let top = Infinity, bottom = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const e = { x1: x(ring[i][0]), y1: y(ring[i][1]), x2: x(ring[i + 1][0]), y2: y(ring[i + 1][1]) };
      if (e.y1 === e.y2) continue; // horizontal edges never cross a row's centre line
      edges.push(e);
      top = Math.min(top, e.y1, e.y2);
      bottom = Math.max(bottom, e.y1, e.y2);
    }
  }

  const crossings: number[] = [];
  for (let row = Math.max(0, Math.floor(top)); row <= Math.min(height - 1, Math.ceil(bottom)); row++) {
    const cy = row + 0.5; // sample at the pixel centre
    crossings.length = 0;
    for (const e of edges) {
      // Half-open test (one end in, the other out), so a vertex exactly on the line counts once, not twice
      if ((e.y1 <= cy) !== (e.y2 <= cy)) crossings.push(e.x1 + ((cy - e.y1) / (e.y2 - e.y1)) * (e.x2 - e.x1));
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      // Pixels whose centre (col + 0.5) lies between the two crossings
      const from = Math.max(0, Math.ceil(crossings[k] - 0.5)), to = Math.min(width - 1, Math.floor(crossings[k + 1] - 0.5));
      for (let col = from; col <= to; col++) ids[row * width + col] = id;
    }
  }
}
