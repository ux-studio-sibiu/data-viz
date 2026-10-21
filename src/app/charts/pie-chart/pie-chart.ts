import { Component, computed, input } from '@angular/core';
import { arc, pie } from 'd3-shape';

// One slice: its label, its value, its colour, the text shown for it (e.g. "32%"), and optionally a shorter name to
// write on the slice when the label is long ("USA" for "United States of America")
export type PieSlice = { label: string; value: number; color: string; note: string; short?: string };

const SIZE = 96; // viewBox units: the pie is drawn at whatever width the key gives it
const NAME_PX = 4.5; // the names' font size on the slices, in viewBox units (.slice-name)

// A small pie with its key under it, as wide as the key (lesson 15). Generic: slices in, drawn in the order given (clockwise from 12 o'clock).
// D3 computes the angles (pie) and the paths (arc); Angular draws, as with every chart here.
//   <app-pie-chart [slices]="[{ label: 'China', value: 12290, color: '#141414', note: '32%' }, …]" label="…" />
@Component({
  selector: 'app-pie-chart',
  template: `
    <figure class="nsc-pie-chart">
      <svg [attr.viewBox]="-SIZE / 2 + ' ' + -SIZE / 2 + ' ' + SIZE + ' ' + SIZE" role="img" [attr.aria-label]="label()">
        @for (p of paths(); track p.label) { <path [attr.d]="p.d" [style.fill]="p.color" /> }
        <!-- Each slice's note written on it, where there's room; the key below names every slice either way -->
        @for (p of paths(); track p.label) {
          @if (p.labelled) {
            <text class="on-slice" [class.is-light]="p.darkSlice" [attr.x]="p.at[0]" [attr.y]="p.at[1]">
              <tspan class="note" [attr.x]="p.at[0]" [attr.dy]="p.name ? '-0.35em' : '0'">{{ p.note }}</tspan>
              @if (p.name) { <tspan class="slice-name" [attr.x]="p.at[0]" dy="1.45em">{{ p.name }}</tspan> }
            </text>
          }
        }
      </svg>
      <ol class="key">
        @for (s of slices(); track s.label) {
          <li><span class="swatch" [style.background]="s.color"></span><span class="name">{{ s.label }}</span><strong>{{ s.note }}</strong></li>
        }
      </ol>
    </figure>
  `,
  styles: `
    :host { display: block; }
    // A column as wide as the key's widest line; the pie fills that width (its viewBox is square, so its height follows)
    .nsc-pie-chart { display: inline-flex; flex-direction: column; gap: 10px; margin: 0; }
    svg { display: block; width: 100%; height: auto; }
    .on-slice { fill: var(--ink); text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
    .note { font-size: 7px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .slice-name { font-size: 4.5px; }
    .on-slice.is-light { fill: var(--surface); }
    path { stroke: var(--surface); stroke-width: 1; vector-effect: non-scaling-stroke; } // a hairline between slices, at any size
    .key { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; font-size: 0.75rem; color: var(--ink); }
    .key li { display: flex; align-items: center; gap: 6px; }
    .swatch { flex: none; width: 10px; height: 10px; border: 1px solid var(--ink); }
    .name { flex: 1; white-space: nowrap; }
    .key strong { font-variant-numeric: tabular-nums; text-align: right; }
  `
})
export class PieChart {
  readonly slices = input.required<PieSlice[]>();
  readonly label = input(''); // what the chart shows, for screen readers

  protected readonly SIZE = SIZE;

  protected readonly paths = computed(() => {
    const angles = pie<PieSlice>().value(s => s.value).sort(null)(this.slices()); // sort(null): keep the order given
    const draw = arc<(typeof angles)[number]>().innerRadius(0).outerRadius(SIZE / 2 - 1);
    // Labels at 62% of the radius, in the middle of their slice's angle. Only on slices wide enough to hold one (~0.35 rad,
    // about 6%). White on dark greys, ink on light ones, by the slice colour's lightness.
    const place = arc<(typeof angles)[number]>().innerRadius(SIZE * 0.31).outerRadius(SIZE * 0.31);
    // A name goes under the number when it fits: its estimated width (~0.55 of the font size per character) within 80% of
    // the slice's arc at that radius. The short name if one is given, else the label.
    return angles.map(a => {
      const angle = a.endAngle - a.startAngle, name = a.data.short ?? a.data.label;
      const fits = name.length * NAME_PX * 0.55 < angle * SIZE * 0.31 * 0.8;
      return {
        label: a.data.label, color: a.data.color, note: a.data.note, d: draw(a) ?? '',
        at: place.centroid(a), labelled: angle > 0.35, name: angle > 0.35 && fits ? name : null, darkSlice: lightness(a.data.color) < 0.55
      };
    });
  });
}

// 0 (black) … 1 (white), from a #rrggbb colour: perceived lightness, close enough to choose a label colour
function lightness(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
