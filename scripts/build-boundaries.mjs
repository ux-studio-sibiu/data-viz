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
import { mergeArcs, quantize } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify, sphericalTriangleArea } from 'topojson-simplify';

const VERSION = 'v5.1.2'; // pinned: the same input always gives the same output
const SOURCE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${VERSION}/geojson/ne_50m_admin_0_countries.geojson`;
const KEEP = 0.25;  // keep the 25% most significant points (by spherical triangle area)
const PROTECT = 24; // arcs with this many points or fewer are never simplified

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

// Simplify on the sphere (we draw a globe, so spherical area, not flat area, decides which points matter)
topo = presimplify(topo, sphericalTriangleArea); // adds a weight to every point: [lon, lat, weight]
// Microstates and small islands are short arcs. Without this, Vatican collapses to a single point and vanishes.
for (const arc of topo.arcs) if (arc.length <= PROTECT) for (const point of arc) point[2] = Infinity;
topo = simplify(topo, quantile(topo, 1 - KEEP));  // drops low-weight points (each ring keeps its first and last point)

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
console.log(`Source size:      ${kb(JSON.stringify(source))}`);
console.log(`Topology size:    ${kb(JSON.stringify(topo))}`);

function round(n, digits) { const f = 10 ** digits; return Math.round(n * f) / f; }
