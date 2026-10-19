// Lesson 02: builds the country boundaries and metadata the app loads.
//   npm run data:boundaries            (uses the cached download)
//   npm run data:boundaries -- --fresh (downloads again)
//
// Natural Earth 1:50m admin-0 countries (public domain) → public/data/countries-50m.topo.json + public/data/countries.json
// Runs in Node, at build time, never in the browser. The output is committed, so the app never depends on a third-party server.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea } from 'd3-geo';
import { feature, mergeArcs, quantize } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify, sphericalTriangleArea } from 'topojson-simplify';

const VERSION = 'v5.1.2'; // pinned: the same input always gives the same output
const SOURCE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${VERSION}/geojson/ne_50m_admin_0_countries.geojson`;
const KEEP = 0.15;              // keep the 15% most significant points (by spherical triangle area), then smooth (Chaikin)
const MIN_ISLAND_KM2 = 250;     // drop free-standing islands smaller than this, unless they are a country's main body
const SMALL_COUNTRY_KM2 = 2000; // countries smaller than this keep their main body unsimplified (Vatican, Monaco, Nauru…)
const EARTH_RADIUS_KM = 6371;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheFile = join(root, 'scripts/.cache/ne_50m_admin_0_countries.geojson');
const outDir = join(root, 'public/data');

// --- 1. Download (once) -------------------------------------------------------------------------
if (process.argv.includes('--fresh') || !existsSync(cacheFile)) {
  console.log(`Downloading ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, await res.text());
}
const source = JSON.parse(await readFile(cacheFile, 'utf8'));

// --- 2. A stable id per country ------------------------------------------------------------------
// ISO 3166-1 alpha-3 is what the statistics use (OWID, World Bank, UN). Natural Earth has several code fields:
//   ISO_A3     the strict code. -99 for France and Norway (their overseas parts are separate polygons).
//   ISO_A3_EH  "ISO, except here": FRA and NOR fixed. -99 only where no ISO code exists.
//   ADM0_A3    Natural Earth's own code, always set.
// For the 4 areas without an ISO code we use a code the statistics sources also use, or ADM0_A3.
const NO_ISO = { KOS: 'XKX' }; // Kosovo: the World Bank's user-assigned code. Somaliland (SOL), N. Cyprus (CYN), Siachen (KAS) keep ADM0_A3.
const iso = p => /^[A-Z]{3}$/.test(p.ISO_A3_EH);
const idOf = p => (iso(p) ? p.ISO_A3_EH : NO_ISO[p.ADM0_A3] ?? p.ADM0_A3);

// Dependencies (Greenland, Puerto Rico…) point to their sovereign state by name; resolve that to an id
const sovereignId = new Map(source.features.filter(f => f.properties.ADMIN === f.properties.SOVEREIGNT).map(f => [f.properties.SOVEREIGNT, idOf(f.properties)]));

const INCOME = { '1. High income: OECD': 'high', '2. High income: nonOECD': 'high', '3. Upper middle income': 'upper-middle', '4. Lower middle income': 'lower-middle', '5. Low income': 'low' };

// --- 3. Metadata: one record per id ---------------------------------------------------------------
// Several features can share an id (Australia + 2 small territories coded AUS); the main one (ADMIN = name of the id's country) wins.
const countries = new Map();
for (const { properties: p } of source.features) {
  const id = idOf(p);
  if (countries.has(id) && p.ADMIN !== p.SOVEREIGNT) continue;
  const sovereign = sovereignId.get(p.SOVEREIGNT);
  countries.set(id, {
    id,
    iso2: /^[A-Z]{2}$/.test(p.ISO_A2_EH) ? p.ISO_A2_EH : null,
    hasIsoCode: iso(p),
    name: p.NAME,
    longName: p.NAME_LONG,
    sovereign: sovereign && sovereign !== id ? sovereign : null,
    continent: p.CONTINENT,
    subregion: p.SUBREGION,
    incomeGroup: INCOME[p.INCOME_GRP] ?? null,
    label: [round(p.LABEL_X, 3), round(p.LABEL_Y, 3)] // [lon, lat]: where the name goes, and where the camera flies to (lesson 10)
  });
}

// --- 4. Geometry: GeoJSON → TopoJSON → merged → simplified ----------------------------------------
// TopoJSON stores each shared border once, as an "arc" both neighbours reference. Smaller, and no slivers when simplified.
let topo = topology({ countries: { type: 'FeatureCollection', features: source.features.map(f => ({ type: 'Feature', id: idOf(f.properties), properties: {}, geometry: f.geometry })) } });

// Features sharing an id become one MultiPolygon, so picking and colouring see one country
const byId = new Map(); // ≈ Map.groupBy, which needs Node 21+
for (const g of topo.objects.countries.geometries) byId.set(g.id, [...(byId.get(g.id) ?? []), g]);
topo.objects.countries.geometries = [...byId].map(([id, geometries]) => geometries.length === 1 ? geometries[0] : { ...mergeArcs(topo, geometries), id });

// Drop small islands, safely. An island goes only if ALL three hold:
//   1. it isn't the country's largest polygon, so no country can disappear
//   2. it's smaller than MIN_ISLAND_KM2
//   3. it's free-standing: none of its arcs is shared with another polygon, so no land border gets a gap
const dropped = new Map();
const uses = new Map();
for (const g of topo.objects.countries.geometries) for (const p of polygonsOf(g)) for (const a of p.flat()) uses.set(arcIndex(a), (uses.get(arcIndex(a)) ?? 0) + 1);
const kept = topo.objects.countries.geometries.map(g => {
  const polygons = polygonsOf(g), areas = polygons.map(p => areaKm2(topo, p)), main = areas.indexOf(Math.max(...areas));
  const keep = polygons.filter((p, i) => i === main || areas[i] >= MIN_ISLAND_KM2 || !p.flat().every(a => uses.get(arcIndex(a)) === 1));
  if (keep.length < polygons.length) dropped.set(g.id, polygons.length - keep.length);
  return keep.length === 1 ? { type: 'Polygon', arcs: keep[0], id: g.id } : { type: 'MultiPolygon', arcs: keep, id: g.id };
});
// Rebuild the topology from what's left, so the dropped islands' arcs leave the file too
topo = topology({ countries: { type: 'FeatureCollection', features: kept.map(g => ({ ...feature(topo, g), properties: {} })) } });

// Small countries keep their main body exactly: its arcs are marked before simplifying (weight ∞ = never dropped).
// Without this, Vatican collapses to a single point and Norfolk Island to a sliver.
const protectedArcs = new Set();
for (const g of topo.objects.countries.geometries) {
  const polygons = polygonsOf(g), areas = polygons.map(p => areaKm2(topo, p));
  if (areas.reduce((sum, a) => sum + a, 0) >= SMALL_COUNTRY_KM2) continue;
  for (const a of polygons[areas.indexOf(Math.max(...areas))].flat()) protectedArcs.add(arcIndex(a));
}

// Simplify on the sphere (we draw a globe, so spherical area, not flat area, decides which points matter)
topo = presimplify(topo, sphericalTriangleArea); // adds a weight to every point: [lon, lat, weight]
for (const i of protectedArcs) for (const point of topo.arcs[i]) point[2] = Infinity;
// Points on the edge of the flat map (lon ±180°, lat -90°) are always kept. On the sphere they add no area (Antarctica's
// 257 points along -90° are all the same point, the pole), so they get weight 0, and the first build dropped them all.
// The flat ID map (lesson 05) needs them: without them, the cap south of 84°S was ocean and the South Pole a hole.
for (const arc of topo.arcs) for (const point of arc) if (Math.abs(point[0]) === 180 || point[1] === -90) point[2] = Infinity;
// Every ring keeps its 3 most significant corners (plus the arc endpoints, which are always kept), so it stays a real shape.
// With one global threshold, a round island has no point that matters much on its own: Visvalingam dropped them all,
// and 205 rings, one of them a 30 000 km² Arctic island, collapsed to a line.
for (const g of topo.objects.countries.geometries) {
  for (const ring of polygonsOf(g).flat()) {
    const interior = ring.flatMap(a => topo.arcs[arcIndex(a)].slice(1, -1));
    interior.sort((p, q) => q[2] - p[2]).slice(0, 3).forEach(point => (point[2] = Infinity));
  }
}
// quantile() sorts the weights from highest to lowest, so its argument is the share of points to KEEP.
// (The first version passed 1 - KEEP, which kept 75% instead of 25%: the file was 594 kB instead of ~330.)
const minWeight = quantile(topo, KEEP);

// Simplify, then smooth: one pass of Chaikin corner cutting on every arc, endpoints fixed. Arcs are shared, so both
// neighbours get the same smoothed border: no gaps or overlaps. Endpoints are where 3 countries meet, or a border meets
// the coast; moving them would break those joints. Protected arcs (small countries' main bodies) are left exact.
// Where two lines run very close (a fjord, a river border, a strait), the simplified or smoothed lines can cross.
// Those arcs are then kept at full detail and unsmoothed, and the check runs again, until nothing crosses.
const presimplified = topo;
const exactArcs = new Set(protectedArcs), crossingLog = [];
for (;;) {
  for (const i of exactArcs) for (const point of presimplified.arcs[i]) point[2] = Infinity;
  topo = simplify(presimplified, minWeight); // drops low-weight points (each ring keeps its first and last point)
  topo.arcs = topo.arcs.map((arc, i) => (exactArcs.has(i) ? arc : chaikin(arc)));
  const found = crossings(topo.arcs);
  crossingLog.push(found.length);
  if (!found.length || crossingLog.length > 5) break;
  for (const { arcs } of found) for (const i of arcs) exactArcs.add(i);
}

// Quantize last: snap coordinates to a 100 000 × 100 000 grid and store each point as a small integer delta from the previous one.
// This is where most of the size goes, and it also drops the weights simplify left behind.
topo = quantize(topo, 1e5);

// --- 5. Write -----------------------------------------------------------------------------------
const meta = { source: 'Natural Earth 1:50m Admin 0 – Countries', version: VERSION, url: 'https://www.naturalearthdata.com/', license: 'Public domain' };
const list = [...countries.values()].sort((a, b) => a.name.localeCompare(b.name));
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'countries-50m.topo.json'), JSON.stringify(topo));
await writeFile(join(outDir, 'countries.json'), JSON.stringify({ ...meta, countries: list }, null, 1));

// --- 6. Report ----------------------------------------------------------------------------------
const kb = s => `${(Buffer.byteLength(s) / 1024).toFixed(0)} kB`;
console.log(`Source features:  ${source.features.length}`);
console.log(`Countries (ids):  ${list.length}`);
console.log(`Merged ids:       ${[...byId].filter(([, g]) => g.length > 1).map(([id, g]) => `${id} (${g.length})`).join(', ')}`);
console.log(`No ISO code:      ${list.filter(c => !c.hasIsoCode).map(c => `${c.name} → ${c.id}`).join(', ')}`);
console.log(`Islands dropped:  ${[...dropped.values()].reduce((a, b) => a + b, 0)} (< ${MIN_ISLAND_KM2} km², free-standing, not a main body). Most: ${[...dropped].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => `${id} ${n}`).join(', ')}`);
console.log(`Protected:        ${protectedArcs.size} arcs (main bodies of countries < ${SMALL_COUNTRY_KM2} km²)`);
console.log(`Points:           ${topo.arcs.reduce((n, a) => n + a.length, 0)} (keep ${KEEP * 100}%, then one Chaikin pass)`);
console.log(`Self-crossings:   ${crossingLog.join(' → ')} (each pass keeps the crossing arcs at full detail; ${exactArcs.size - protectedArcs.size} arcs kept exact)`);
console.log(`Source size:      ${kb(JSON.stringify(source))}`);
console.log(`Topology size:    ${kb(JSON.stringify(topo))}`);

function round(n, digits) { const f = 10 ** digits; return Math.round(n * f) / f; }
function polygonsOf(g) { return g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []; }
function arcIndex(a) { return a < 0 ? ~a : a; } // TopoJSON stores a reversed arc as its bitwise complement
// One Chaikin pass on an open line: each segment PQ becomes two points at 1/4 and 3/4 of the way, which cuts every corner.
// The first and last points stay exactly where they are.
function chaikin(arc) {
  if (arc.length < 3) return arc;
  const out = [arc[0]];
  for (let i = 0; i < arc.length - 1; i++) {
    const [px, py] = arc[i], [qx, qy] = arc[i + 1];
    if (i > 0) out.push([0.75 * px + 0.25 * qx, 0.75 * py + 0.25 * qy]);
    if (i < arc.length - 2) out.push([0.25 * px + 0.75 * qx, 0.25 * py + 0.75 * qy]);
  }
  out.push(arc[arc.length - 1]);
  return out;
}

// Segments of different arcs (or non-neighbouring segments of one arc) that cross. Simplifying and smoothing can both
// make two close lines cross, e.g. in a narrow fjord. Segments are bucketed into a 1° grid so only nearby pairs are tested.
function crossings(arcs) {
  const segments = [], grid = new Map(), found = [], tested = new Set();
  arcs.forEach((arc, a) => { for (let i = 0; i < arc.length - 1; i++) segments.push([arc[i], arc[i + 1], a]); });
  segments.forEach(([p, q], n) => {
    for (let x = Math.floor(Math.min(p[0], q[0])); x <= Math.floor(Math.max(p[0], q[0])); x++)
      for (let y = Math.floor(Math.min(p[1], q[1])); y <= Math.floor(Math.max(p[1], q[1])); y++) {
        const key = x * 1000 + y;
        grid.set(key, [...(grid.get(key) ?? []), n]);
      }
  });
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const orient = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (const list of grid.values()) {
    for (let j = 0; j < list.length; j++) for (let k = j + 1; k < list.length; k++) {
      const pair = list[j] * 1e6 + list[k];
      if (tested.has(pair)) continue;
      tested.add(pair);
      const [p, q, arcA] = segments[list[j]], [r, t, arcB] = segments[list[k]];
      if (same(p, r) || same(p, t) || same(q, r) || same(q, t)) continue; // neighbours touching at a shared point
      if (orient(p, q, r) * orient(p, q, t) < 0 && orient(r, t, p) * orient(r, t, q) < 0) found.push({ at: p, arcs: [arcA, arcB] });
    }
  }
  return found;
}

function areaKm2(t, arcs) { return geoArea(feature(t, { type: 'Polygon', arcs })) * EARTH_RADIUS_KM ** 2; }
