// Lesson 08: builds the CO₂ data the app loads.
//   npm run data:co2            (uses the cached download)
//   npm run data:co2 -- --fresh (downloads again)
//
// Our World in Data's CO₂ and Greenhouse Gas Emissions dataset (CC BY 4.0) → public/data/co2/
//   meta.json       source, license, years, and a definition of every metric (from OWID's codebook)
//   <metric>.json   one file per metric: { metric, firstYear, values: { FRA: [1900 value, 1901 value, …], … } }
// One file per metric so the app downloads only what it shows (lesson 09 switches metrics).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '382ee6c662b0ece26e111f263b44c029afad7787'; // owid/co2-data, 2026-06-02. Pinned: same input, same output.
const BASE = `https://raw.githubusercontent.com/owid/co2-data/${COMMIT}`;
const FIRST_YEAR = 1900; // earlier years exist (from 1750) but are sparse outside a few countries

// The metrics the app uses. `from` is the OWID column; gdp_per_capita is derived (OWID has GDP and population, not their ratio).
const METRICS = [
  { id: 'co2_per_capita', from: 'co2_per_capita' },
  { id: 'co2', from: 'co2' },
  { id: 'cumulative_co2', from: 'cumulative_co2' },
  { id: 'share_global_cumulative_co2', from: 'share_global_cumulative_co2' },
  { id: 'consumption_co2_per_capita', from: 'consumption_co2_per_capita' },
  { id: 'population', from: 'population' },
  { id: 'gdp_per_capita', derive: row => (row.gdp && row.population ? row.gdp / row.population : null) }
];
const DERIVED = {
  gdp_per_capita: { title: 'GDP per capita', description: 'Gross domestic product divided by population, adjusted for inflation and differences in living costs between countries. Derived here from OWID\'s gdp and population columns.', unit: 'international-$ in 2011 prices per person', source: 'Bolt and van Zanden – Maddison Project Database (via Our World in Data)' }
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'scripts/.cache');
const outDir = join(root, 'public/data/co2');

// --- 1. Download (once) -------------------------------------------------------------------------
const load = async name => {
  const file = join(cacheDir, name);
  if (process.argv.includes('--fresh') || !existsSync(file)) {
    console.log(`Downloading ${BASE}/${name}`);
    const res = await fetch(`${BASE}/${name}`);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, await res.text());
  }
  return parseCsv(await readFile(file, 'utf8'));
};
const data = await load('owid-co2-data.csv');
const codebook = await load('owid-co2-codebook.csv');

// --- 2. Join on our country ids ---------------------------------------------------------------------
// OWID uses ISO 3166-1 alpha-3, like lesson 02, so most rows join directly. Rows without an iso_code are regions and
// aggregates (World, Africa, "High-income countries"…) and are skipped. Countries we don't draw (Christmas Island,
// Bonaire) are skipped too.
const countries = JSON.parse(await readFile(join(root, 'public/data/countries.json'), 'utf8')).countries;
const ours = new Set(countries.map(c => c.id));
const rows = data.filter(r => ours.has(r.iso_code) && +r.year >= FIRST_YEAR);
const lastYear = Math.max(...rows.map(r => +r.year));
const yearCount = lastYear - FIRST_YEAR + 1;
const skipped = [...new Set(data.filter(r => r.iso_code && !ours.has(r.iso_code)).map(r => `${r.country} (${r.iso_code})`))];

// --- 3. One series per metric: id → values from FIRST_YEAR to lastYear, null where OWID has no value ----------------------
// Rounded to 4 significant digits: 4.068 t per person, 270.3 Mt. More would be false precision, and bigger files.
const number = s => (s === '' || s === undefined ? null : Number(s));
const round = v => (v === null || !Number.isFinite(v) ? null : Number(v.toPrecision(4)));
const series = Object.fromEntries(METRICS.map(m => [m.id, {}]));
for (const r of rows) {
  const row = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'country' || k === 'iso_code' ? v : number(v)]));
  for (const m of METRICS) {
    const value = round(m.derive ? m.derive(row) : row[m.from]);
    if (value === null) continue;
    (series[m.id][r.iso_code] ??= new Array(yearCount).fill(null))[+r.year - FIRST_YEAR] = value;
  }
}

// --- 4. Metadata from OWID's codebook (titles, descriptions, units, sources) --------------------------------------------
const definitions = Object.fromEntries(codebook.map(c => [c.column, { title: c.title, description: c.description, unit: c.unit, source: c.source }]));
const latestCoverage = values => Object.values(values).filter(v => v[yearCount - 1] !== null).length;
const lastYearWithData = values => {
  for (let i = yearCount - 1; i >= 0; i--) if (Object.values(values).some(v => v[i] !== null)) return FIRST_YEAR + i;
  return null;
};
const metrics = METRICS.map(m => ({
  id: m.id,
  ...(m.derive ? DERIVED[m.id] : definitions[m.from]),
  countries: Object.keys(series[m.id]).length,         // countries with at least one value
  lastYear: lastYearWithData(series[m.id]),             // GDP stops earlier than CO₂
  countriesInLastYear: latestCoverage(series[m.id])
}));
const withData = new Set(Object.values(series).flatMap(values => Object.keys(values)));
const meta = {
  source: 'Our World in Data – CO₂ and Greenhouse Gas Emissions',
  url: 'https://github.com/owid/co2-data',
  commit: COMMIT,
  license: 'CC BY 4.0 (attribution required)',
  firstYear: FIRST_YEAR,
  lastYear,
  metrics,
  noData: countries.filter(c => !withData.has(c.id)).map(c => c.id) // drawn on the globe, but OWID has nothing for them
};

// --- 5. Write -------------------------------------------------------------------------------------------------------------
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'meta.json'), JSON.stringify(meta, null, 1));
const sizes = [];
for (const m of METRICS) {
  // Sorted keys: the same input always gives byte-identical output (clean git diffs)
  const values = Object.fromEntries(Object.entries(series[m.id]).sort(([a], [b]) => a.localeCompare(b)));
  const json = JSON.stringify({ metric: m.id, firstYear: FIRST_YEAR, values });
  await writeFile(join(outDir, `${m.id}.json`), json);
  sizes.push(`${m.id} ${(Buffer.byteLength(json) / 1024).toFixed(0)} kB`);
}

// --- 6. Report ------------------------------------------------------------------------------------------------------------
console.log(`Years:            ${FIRST_YEAR}–${lastYear}`);
console.log(`Countries:        ${withData.size} of ${countries.length} have data`);
for (const m of metrics) console.log(`  ${m.id.padEnd(28)} ${m.countries} countries, last year ${m.lastYear} (${m.countriesInLastYear} in ${lastYear})`);
console.log(`No data:          ${meta.noData.join(' ')}`);
console.log(`Skipped:          ${skipped.join(', ')}`);
console.log(`Files:            ${sizes.join(', ')}`);

// A small CSV parser: commas, quotes and "" escapes inside quoted fields. Returns one object per row, keyed by the header.
function parseCsv(text) {
  const records = [];
  let record = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { record.push(field); field = ''; }
    else if (ch === '\n') { record.push(field); records.push(record); record = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || record.length) { record.push(field); records.push(record); }
  const [header, ...body] = records;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
