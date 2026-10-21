import { Component, input } from '@angular/core';

// The key to a 3 × 3 bivariate map (lesson 16): the nine colours as a grid, x rising to the right, y rising upwards, with
// the two corners that carry the story spelled out. The title row (the metric switcher) comes in through the slot,
// as with the classed legend.
//   <app-bivariate-legend [colors]="colors" xLabel="More vulnerable" yLabel="More responsible" caption="…">
//     <select legend-title>…</select>
//   </app-bivariate-legend>
@Component({
  selector: 'app-bivariate-legend',
  templateUrl: './bivariate-legend.html',
  styleUrl: './bivariate-legend.scss'
})
export class BivariateLegend {
  readonly colors = input.required<string[][]>(); // [y][x], 0 = low
  readonly xLabel = input('');
  readonly yLabel = input('');
  readonly highYNote = input(''); // what the high-y, low-x corner means
  readonly highXNote = input(''); // what the high-x, low-y corner means
  readonly caption = input('');

  protected readonly rows = [2, 1, 0]; // drawn top to bottom: high y first
}
