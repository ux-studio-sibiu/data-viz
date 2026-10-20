import { quantileSorted } from 'd3-array';
import { scaleThreshold } from 'd3-scale';
import type { MetricSeries } from '../data/co2';

// ColorBrewer "Oranges", 7 classes (Cynthia Brewer, colorbrewer2.org, Apache 2.0): one hue, light → dark, perceptually
// ordered and colour-blind safe. Warm, for carbon, and clear on the white sea.
export const ORANGES_7 = ['#feedde', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#8c2d04'];

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
export function choropleth(series: MetricSeries, year: number, colors = ORANGES_7): Choropleth {
  const values = new Map<string, number>();
  for (const [id, row] of Object.entries(series.values)) {
    const v = row[year - series.firstYear];
    if (v !== null && v !== undefined) values.set(id, v);
  }
  const sorted = [...values.values()].sort((a, b) => a - b);

  // 6 inner breaks for 7 classes, at the 1/7, 2/7 … 6/7 quantiles; rounding can merge two, so keep them strictly increasing
  const breaks = colors.slice(1).map((_, i) => Number(quantileSorted(sorted, (i + 1) / colors.length)!.toPrecision(2)));
  const thresholds = breaks.filter((b, i) => i === 0 || b > breaks[i - 1]);
  const classes = colors.slice(0, thresholds.length + 1);

  const scale = scaleThreshold<number, string>().domain(thresholds).range(classes); // ≈ a lookup: which interval is v in?
  return { year, thresholds, colors: classes, fills: new Map([...values].map(([id, v]) => [id, scale(v)])), values };
}
