import { Component, computed, input } from '@angular/core';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';

const W = 160, H = 32, PAD = 3;

// A word-sized line chart (lesson 14): no axes, no labels, just the shape over time, a dot on one year and an optional
// reference line. Generic: values per year from firstYear, and a y domain from the caller.
//   <app-sparkline [values]="row" [firstYear]="1900" [domain]="[0, 20]" [markYear]="2024" [reference]="100" />
//
// The domain comes from outside on purpose: sparklines side by side are only comparable if they share one scale. Each
// fitted to its own data, a country at 0.3 t and one at 15 t draw the same height, and the comparison is gone.
@Component({
  selector: 'app-sparkline',
  template: `
    <svg class="nsc-sparkline" [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="label()">
      @if (referenceY(); as ry) { <line class="reference" [attr.x1]="0" [attr.x2]="W" [attr.y1]="ry" [attr.y2]="ry" /> }
      <path class="series" [attr.d]="path()" />
      @if (mark(); as m) { <circle class="dot" [attr.cx]="m.x" [attr.cy]="m.y" r="2.5" /> }
    </svg>
  `,
  styles: `
    :host { display: block; }
    .nsc-sparkline { display: block; width: 100%; height: ${H}px; overflow: visible; }
    .series { fill: none; stroke: var(--ink); stroke-width: 1.5; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
    .reference { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
    .dot { fill: var(--surface); stroke: var(--ink); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  `
})
export class Sparkline {
  readonly values = input.required<(number | null)[]>();
  readonly firstYear = input.required<number>();
  readonly domain = input.required<[number, number]>();
  readonly markYear = input<number | null>(null);
  readonly reference = input<number | null>(null); // e.g. 100 on an index: the base year's level
  readonly label = input('');

  protected readonly W = W;
  protected readonly H = H;

  private readonly x = computed(() => scaleLinear().domain([0, Math.max(1, this.values().length - 1)]).range([0, W]));
  private readonly y = computed(() => scaleLinear().domain(this.domain()).range([H - PAD, PAD]));

  // Gaps stay gaps (defined()), as in the line chart: no data is never drawn as zero
  protected readonly path = computed(() => {
    const x = this.x(), y = this.y();
    return line<number | null>().defined(v => v !== null).x((_, i) => x(i)).y(v => y(v!))(this.values()) ?? '';
  });
  protected readonly referenceY = computed(() => { const r = this.reference(); return r === null ? null : this.y()(r); });
  protected readonly mark = computed(() => {
    const year = this.markYear(), i = year === null ? -1 : year - this.firstYear(), v = this.values()[i];
    return v === null || v === undefined ? null : { x: this.x()(i), y: this.y()(v) };
  });
}
