// The shape of public/data/co2/, written by scripts/build-co2.mjs (lesson 08).

export type MetricId =
  | 'co2_per_capita'
  | 'co2'
  | 'cumulative_co2'
  | 'share_global_cumulative_co2'
  | 'consumption_co2_per_capita'
  | 'population'
  | 'gdp_per_capita';

export type MetricInfo = {
  id: MetricId;
  title: string;       // "CO₂ emissions per capita"
  description: string; // OWID's definition, quoted
  unit: string;        // "tonnes per person (t/person)"
  source: string;
  countries: number;   // countries with at least one value
  lastYear: number;    // the latest year with any value (GDP stops in 2022, CO₂ in 2024)
  countriesInLastYear: number;
};

export type Co2Meta = {
  source: string;
  url: string;
  commit: string;
  license: string;
  firstYear: number;
  lastYear: number;
  metrics: MetricInfo[];
  noData: string[]; // countries on the globe without any OWID data (Kosovo, Western Sahara, small dependencies…)
};

// One metric: values[id][year - firstYear]. null = no value that year (missing data is normal, not an error).
export type MetricSeries = {
  metric: MetricId;
  firstYear: number;
  values: Record<string, (number | null)[]>;
};

// A value and the year it's from: the latest year with data isn't the same for every country or metric
export type Reading = { value: number; year: number };

// --- validation at the boundary -----------------------------------------------------------------------------------------
// TypeScript types disappear at runtime: `httpResource<MetricSeries>` would happily hand over anything the server sends.
// These run as httpResource's `parse` option, so a broken or outdated file fails loudly when it arrives (error()),
// not three components later as "Cannot read properties of undefined".

export function parseSeries(raw: unknown): MetricSeries {
  const s = raw as MetricSeries;
  if (typeof s?.metric !== 'string' || typeof s.firstYear !== 'number' || typeof s.values !== 'object' || s.values === null) {
    throw new Error('Not a metric series: expected { metric, firstYear, values }');
  }
  for (const [id, values] of Object.entries(s.values)) {
    if (!Array.isArray(values) || values.some(v => v !== null && typeof v !== 'number')) throw new Error(`Bad values for ${id} in ${s.metric}`);
  }
  return s;
}

export function parseMeta(raw: unknown): Co2Meta {
  const m = raw as Co2Meta;
  if (!Array.isArray(m?.metrics) || typeof m.firstYear !== 'number' || typeof m.lastYear !== 'number' || !Array.isArray(m.noData)) {
    throw new Error('Not CO₂ metadata: expected { metrics, firstYear, lastYear, noData }');
  }
  return m;
}

// The latest value at or before `year` (default: the last year of the series). null if the country has none.
export function latest(series: MetricSeries | undefined, id: string, year?: number): Reading | null {
  const values = series?.values[id];
  if (!series || !values) return null;
  for (let i = Math.min(values.length - 1, (year ?? Infinity) - series.firstYear); i >= 0; i--) {
    const v = values[i];
    if (v !== null) return { value: v, year: series.firstYear + i };
  }
  return null;
}
