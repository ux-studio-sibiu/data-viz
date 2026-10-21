import { Component, computed, input } from '@angular/core';

// Class breaks: 2 significant digits, compact (10K, 3K, 0.37), so the labels fit under the swatches even for totals in Mt
const figure = new Intl.NumberFormat('en', { maximumSignificantDigits: 2, notation: 'compact' });

// A classed colour legend: one swatch per class, the class boundaries between them, and a "no data" swatch.
// Generic: thresholds and colours in; the title row (e.g. a metric switcher) comes from the parent through the slot.
//   <app-legend [thresholds]="[1, 2, 5]" [colors]="['#…', '#…', '#…', '#…']" unit="t per person" year="2024">
//     <select legend-title>…</select>
//   </app-legend>
@Component({
  selector: 'app-legend',
  template: `
    <figure class="nsc-legend">
      <figcaption class="title"><ng-content select="[legend-title]" /></figcaption>
      <!-- Swatches in a row, the class boundaries in the row below, each under the gap between two swatches -->
      <div class="scale" [style.--classes]="colors().length">
        @for (c of colors(); track $index) { <span class="swatch" [style.background]="c"></span> }
        <span class="swatch no-data" title="No data"></span>
      </div>
      <div class="ticks" [style.--classes]="colors().length">
        @for (t of labels(); track $index) { <span class="tick" [style.--i]="$index + 1">{{ t }}</span> }
        <span class="tick no-data-label">no data</span>
      </div>
      <p class="caption">{{ unit() }} · {{ year() }}</p>
    </figure>
  `,
  styleUrl: './legend.scss'
})
export class Legend {
  readonly thresholds = input.required<number[]>();
  readonly colors = input.required<string[]>();
  readonly unit = input('');
  readonly year = input<number | string>('');

  protected readonly labels = computed(() => this.thresholds().map(t => figure.format(t)));
}
