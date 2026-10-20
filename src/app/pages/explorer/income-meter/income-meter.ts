import { Component, computed, input } from '@angular/core';
import { INCOME_LABEL, INCOME_LEVEL, type IncomeGroup } from '../../../data/country';

// A country's income group as four rising bars, filled up to the group (1 = low … 4 = high), like a signal-strength icon.
// Used after the name in the detail panel and in the flat map's tooltip. Screen readers get the group's name.
//   <app-income-meter [group]="country.incomeGroup" />
@Component({
  selector: 'app-income-meter',
  template: `@for (step of steps; track step) {<span class="step" [class.is-on]="step <= level()"></span>}`,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  styles: `
    :host { display: inline-flex; align-items: flex-end; gap: 2px; vertical-align: -1px; }
    .step { width: 5px; border: 1.5px solid var(--ink); background: var(--surface); }
    .step:nth-child(1) { height: 6px; }
    .step:nth-child(2) { height: 9px; }
    .step:nth-child(3) { height: 12px; }
    .step:nth-child(4) { height: 15px; }
    .step.is-on { background: var(--ink); }
  `
})
export class IncomeMeter {
  readonly group = input.required<IncomeGroup>();

  protected readonly steps = [1, 2, 3, 4];
  protected readonly level = computed(() => INCOME_LEVEL[this.group()]);
  protected readonly label = computed(() => INCOME_LABEL[this.group()]);
}
