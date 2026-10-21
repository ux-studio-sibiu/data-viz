import { quantileSorted } from 'd3-array';

// Joshua Stevens' 3 × 3 bivariate palette (joshuastevens.net, "Bivariate Choropleth Maps: A How-to Guide"), indexed
// [y class][x class], 0 = low. Two hues blend: x rises in teal, y in pink, and both high is a deep blue-purple. Built so that
// the corners read on their own: pink = high y only, teal = high x only, dark = both, light grey = neither.
export const STEVENS_3X3 = [
  ['#e8e8e8', '#ace4e4', '#5ac8c8'],
  ['#dfb0d6', '#a5add3', '#5698b9'],
  ['#be64ac', '#8c62aa', '#3b4994']
];

export type Bivariate = {
  xBreaks: [number, number]; // x < first → class 0, < second → 1, else 2
  yBreaks: [number, number];
  colors: string[][];          // [y][x]
  fills: Map<string, string>;  // country id → colour; countries missing either value aren't in it: "no data"
  cells: Map<string, [x: number, y: number]>;
};

// Two variables, three classes each, nine colours (lesson 16).
// Classes are tertiles: a third of the countries in each, so each axis reads "low / middle / high compared to the rest",
// whatever its unit. Cut from `breakX` / `breakY` (the latest year, for the same reason as lesson 12: one colour should mean
// the same thing in every year), then applied to `x` / `y` (the year on screen). Only countries with BOTH values count.
export function bivariate(
  x: ReadonlyMap<string, number>, y: ReadonlyMap<string, number>,
  breakX = x, breakY = y, colors = STEVENS_3X3
): Bivariate {
  const both = [...breakX.keys()].filter(id => breakY.has(id));
  const tertiles = (values: number[]): [number, number] => {
    const sorted = values.sort((a, b) => a - b), round = (v: number) => Number(v.toPrecision(2));
    return [round(quantileSorted(sorted, 1 / 3)!), round(quantileSorted(sorted, 2 / 3)!)];
  };
  const xBreaks = tertiles(both.map(id => breakX.get(id)!));
  const yBreaks = tertiles(both.map(id => breakY.get(id)!));
  const classOf = (v: number, [a, b]: [number, number]) => (v < a ? 0 : v < b ? 1 : 2);

  const fills = new Map<string, string>(), cells = new Map<string, [number, number]>();
  for (const [id, xv] of x) {
    const yv = y.get(id);
    if (yv === undefined) continue;
    const cx = classOf(xv, xBreaks), cy = classOf(yv, yBreaks);
    cells.set(id, [cx, cy]);
    fills.set(id, colors[cy][cx]);
  }
  return { xBreaks, yBreaks, colors, fills, cells };
}
