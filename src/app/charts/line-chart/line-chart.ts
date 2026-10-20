import { Component, computed, input, signal } from '@angular/core';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { lastIndexWithValue } from '../../data/co2';
import { figure } from '../../data/format';

// One line: a value per year from the chart's firstYear. null = no value that year (drawn as a gap, never as 0).
export type ChartLine = { id: string; label: string; values: (number | null)[]; reference?: boolean };

const W = 300, H = 150;
// The y labels start at the left edge (x = 0) and the plot runs to the right edge, so the chart lines up with the content
// around it. right: 4 leaves room for the end dot (radius 3 + its stroke).
const M = { top: 8, right: 4, bottom: 20, left: 24 };

// A line chart over years, drawn by Angular (lesson 11).
// D3 only does the maths: scales map years and values to pixels, line() turns points into a path's `d`.
// Angular renders every element from signals, so there's no d3.select(), no enter/update/exit, and nothing to clean up.
//   <app-line-chart [firstYear]="1900" [lines]="[{ id: 'DEU', label: 'Germany', values }]" unit="t" />
@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.html',
  styleUrl: './line-chart.scss'
})
export class LineChart {
  readonly lines = input.required<ChartLine[]>();
  readonly firstYear = input.required<number>();
  readonly unit = input('');
  readonly label = input(''); // what the chart shows, for screen readers
  readonly markYear = input<number | null>(null); // the year the readout rests on when not hovering; null = the latest with data

  protected readonly W = W;
  protected readonly H = H;
  protected readonly M = M;

  protected readonly lastYear = computed(() => this.firstYear() + Math.max(1, ...this.lines().map(l => l.values.length)) - 1);

  // Years → x. Values → y, from 0: a line chart of emissions that doesn't start at 0 makes a 10% change look like a collapse.
  private readonly x = computed(() => scaleLinear().domain([this.firstYear(), this.lastYear()]).range([M.left, W - M.right]));
  private readonly y = computed(() => {
    const top = Math.max(0, ...this.lines().flatMap(l => l.values.map(v => v ?? 0)));
    return scaleLinear().domain([0, top || 1]).range([H - M.bottom, M.top]).nice(4);
  });

  protected readonly xTicks = computed(() => this.x().ticks(5).map(year => ({ year, x: this.x()(year) })));
  protected readonly yTicks = computed(() => {
    const y = this.y(), format = y.tickFormat(4, '~s'); // 12000 → "12k"
    return y.ticks(4).map(v => ({ value: v, y: y(v), label: format(v) }));
  });

  // One path per line. defined() skips the nulls, so a country's missing years break the line instead of diving to 0.
  protected readonly paths = computed(() => {
    const x = this.x(), y = this.y(), first = this.firstYear();
    const path = line<number | null>().defined(v => v !== null).x((_, i) => x(first + i)).y(v => y(v!));
    return this.lines().map(l => ({ id: l.id, reference: !!l.reference, d: path(l.values) ?? '' }));
  });

  // --- the readout: the hovered year, or the latest year the first line has data ---------------------------------------
  private readonly hoverYear = signal<number | null>(null);
  protected readonly year = computed(() => {
    const hovered = this.hoverYear();
    if (hovered !== null) return hovered;
    const mark = this.markYear();
    if (mark !== null) return Math.min(this.lastYear(), Math.max(this.firstYear(), mark));
    const main = this.lines()[0]?.values ?? [];
    const last = lastIndexWithValue(main);
    return this.firstYear() + Math.max(0, last);
  });
  protected readonly hovering = computed(() => this.hoverYear() !== null);
  protected readonly readout = computed(() => {
    const i = this.year() - this.firstYear(), y = this.y(), widest = this.widest();
    return this.lines().map((l, n) => {
      const v = l.values[i] ?? null;
      return { id: l.id, label: l.label, reference: !!l.reference, value: this.text(v), widest: widest[n], y: v === null ? null : y(v) };
    });
  });

  // Each line's longest value text over all years. The template reserves its width, so the readout doesn't jump as you sweep.
  private readonly widest = computed(() =>
    this.lines().map(l => l.values.reduce<string>((w, v) => { const t = this.text(v); return t.length > w.length ? t : w; }, this.text(null)))
  );
  private text(v: number | null) { return v === null ? 'no data' : `${figure.format(v)} ${this.unit()}`; }
  protected readonly ruleX = computed(() => this.x()(this.year()));

  // The pointer's x in viewBox units (the SVG scales with its box), then back to the nearest year
  protected track(e: PointerEvent) {
    const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const year = Math.round(this.x().invert(((e.clientX - box.left) / box.width) * W));
    this.hoverYear.set(Math.min(this.lastYear(), Math.max(this.firstYear(), year)));
  }
  protected leave() { this.hoverYear.set(null); }
}
