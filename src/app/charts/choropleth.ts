import { quantileSorted } from 'd3-array';
import { scaleThreshold } from 'd3-scale';
import type { MetricSeries } from '../data/co2';

// CARTOColors "BrwnYl" (7 classes, plus one darker) (CARTO, CC BY 3.0, attribution on the methodology page): sand → plum, light → dark,
// perceptually ordered. Chosen after comparing 41 candidates on the globe (lesson 12): warm and earthy for carbon, and
// its darkest class is a muted plum rather than black, so the ink borders and the selection hatch stay readable on it.
// Shifted one step lighter for the 7 main classes (each takes the colour of the class below it, with a new palest sand first):
// on the white sea the full ramp read heavy. The original darkest plum stays as an 8th class, kept for the top few (TOP).
export const BRWNYL_8 = ['#f6f1e4', '#ede5cf', '#e0c2a2', '#d39c83', '#c1766f', '#a65461', '#813753', '#541f3f'];

// How many countries the darkest class is for: the handful of largest values, not a seventh of the world
const TOP = 10;

// How the class breaks are cut (see choropleth() below):
//   'quantile'  about the same number of countries per class, the darkest kept for the top few: for evenly spread values
//   'log'       one class per step of ×3 or ×3.3 (… 10, 30, 100, 300, 1000 …): for values over orders of magnitude
export type Breaks = 'quantile' | 'log';

export type Choropleth = {
  year: number;
  thresholds: number[];      // class boundaries: value < thresholds[0] → colors[0], … ≥ last → last colour
  colors: string[];          // one per class (thresholds.length + 1)
  fills: Map<string, string>; // country id → its colour. Countries without a value that year aren't in it: "no data".
  values: Map<string, number>;
};

// Colours every country for one metric in one year (lesson 09).
//
// Classed, not continuous: 7 colours the eye can tell apart and match to the legend, instead of a smooth ramp it can't read
// back. Class breaks are quantiles: each class holds about the same number of countries. CO₂ per person runs from 0.03 t
// to 41 t; equal-width classes (0–6, 6–12, …) would paint nearly every country the palest orange and spend the rest of
// the palette on a handful of Gulf states. Rounded to 2 significant digits, so the legend reads 1.1 / 2.3, not 1.0839.
//
// Lesson 12: the colours of `year`, with the class breaks of `breaksYear` (the explorer passes the metric's latest year).
// Breaks recomputed every year would make "dark orange" mean 0.8 t in 1900 and 8 t in 2024: every year would look equally
// unequal, and playing through time would show nothing growing. Fixed breaks keep one colour = one range of tonnes.
//
// The last colour is reserved for the top TOP countries (in breaksYear): with 7 equal classes, ~30 countries shared the
// darkest one, which then said little. Now the main classes split everyone else by quantiles, and the darkest marks the
// extremes only (about 10: rounding the break to 2 digits can move one or two in or out).
//
// 'log' breaks (added in lesson 15) are for metrics spread over orders of magnitude, like annual CO₂: under 1 Mt to over
// 12,000. There, "the top 10" put China (12,290 Mt) and Russia (~1,800) in one colour, 7× apart. Classes by order of
// magnitude, 1-3-10-30…, keep any 10× gap at least two colours apart, and read naturally in the legend (10, 30, 100 …).
export function choropleth(series: MetricSeries, year: number, breaksYear = year, colors = BRWNYL_8, breaks: Breaks = 'quantile'): Choropleth {
  const values = new Map<string, number>();
  for (const [id, row] of Object.entries(series.values)) {
    const v = row[year - series.firstYear];
    if (v !== null && v !== undefined) values.set(id, v);
  }
  const sorted = Object.values(series.values)
    .map(row => row[breaksYear - series.firstYear])
    .filter((v): v is number => v !== null && v !== undefined)
    .sort((a, b) => a - b);

  const cuts = breaks === 'log' ? logBreaks(sorted, colors.length - 1) : quantileBreaks(sorted, colors.length - 1);
  const thresholds = cuts.filter((b, i) => i === 0 || b > cuts[i - 1]); // rounding can merge two: keep them increasing
  const classes = colors.slice(0, thresholds.length + 1);

  const scale = scaleThreshold<number, string>().domain(thresholds).range(classes); // ≈ a lookup: which interval is v in?
  return { year, thresholds, colors: classes, fills: new Map([...values].map(([id, v]) => [id, scale(v)])), values };
}

// The main classes (all colours but the last) split everyone below the top TOP by quantiles: count - 1 inner breaks, at
// 1/7, 2/7 … 6/7 for 8 colours. Then one more break at the TOP-th largest value. Rounded to 2 significant digits.
function quantileBreaks(sorted: number[], count: number): number[] {
  const rest = sorted.slice(0, Math.max(1, sorted.length - TOP));
  const round = (v: number) => Number(v.toPrecision(2));
  return [
    ...Array.from({ length: count - 1 }, (_, i) => round(quantileSorted(rest, (i + 1) / count)!)),
    round(sorted[Math.max(0, sorted.length - TOP)])
  ];
}

// count breaks from the 1-3-10 ladder (… 0.1, 0.3, 1, 3, 10, 30 …), the top one the largest rung at or under the biggest
// value, so the darkest class is never empty: for annual CO₂ (max 12,290 Mt) that's 10 30 100 300 1k 3k 10k.
function logBreaks(sorted: number[], count: number): number[] {
  // Rung k of the ladder: even k → 10^(k/2) (1, 10, 100 …), odd k → 3 × 10^((k-1)/2) (3, 30, 300 …); negative k go below 1
  const rung = (k: number) => (k % 2 ? 3 : 1) * 10 ** Math.floor(k / 2);
  const top = sorted[sorted.length - 1] ?? 1;
  let k = Math.floor(2 * Math.log10(top));
  while (rung(k) > top) k--;
  while (rung(k + 1) <= top) k++;
  // toPrecision: 3 × 0.1 is 0.30000000000000004 in floating point
  return Array.from({ length: count }, (_, i) => Number(rung(k - count + 1 + i).toPrecision(1)));
}
