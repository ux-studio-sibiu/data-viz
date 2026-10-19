import { Component, computed, inject } from '@angular/core';
import { FlatMap } from '../../charts/flat-map/flat-map';
import { Boundaries } from '../../data/boundaries';
import { latest } from '../../data/co2';
import { Co2Data } from '../../data/co2-data';
import { Globe } from '../../globe/globe';
import { CountrySearch } from './country-search/country-search';
import { ExplorerState } from './explorer-state';

const INCOME = { high: 'High income', 'upper-middle': 'Upper-middle income', 'lower-middle': 'Lower-middle income', low: 'Low income' };
const figure = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 }); // 4.07, 270, 23.5: as precise as the data deserves

// The product page: the globe or the flat map, filling the whole screen. The Globe / Map switch is in the app header.
// Lesson 07: hover, selection and view live in ExplorerState (selection and view in the URL), shared by both views and the search.
// Lesson 08: the selection card shows the country's latest CO₂ figures.
@Component({
  selector: 'app-explorer',
  imports: [FlatMap, Globe, CountrySearch],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class Explorer {
  protected readonly boundaries = inject(Boundaries);
  protected readonly state = inject(ExplorerState);
  private readonly co2 = inject(Co2Data);
  protected readonly country = computed(() => this.boundaries.countries().get(this.state.hovered() ?? ''));
  protected readonly selectedCountry = computed(() => this.boundaries.countries().get(this.state.selected() ?? ''));
  protected readonly income = INCOME;

  // Three metrics for the card. co2Data shares them: lesson 09's map will reuse co2_per_capita without a second request.
  private readonly perCapita = this.co2.metric('co2_per_capita');
  private readonly total = this.co2.metric('co2');
  private readonly historicShare = this.co2.metric('share_global_cumulative_co2');

  // The latest value of each, with its year (they can differ: a country's last per-capita figure may be older than its total)
  protected readonly readings = computed(() => {
    const id = this.state.selected();
    if (!id) return null;
    return { perCapita: latest(this.perCapita.value(), id), total: latest(this.total.value(), id), historicShare: latest(this.historicShare.value(), id) };
  });
  protected readonly co2Loading = computed(() => this.perCapita.isLoading() || this.total.isLoading() || this.historicShare.isLoading());
  protected readonly co2Failed = computed(() => !!(this.perCapita.error() || this.total.error() || this.historicShare.error()));

  protected format(n: number) { return figure.format(n); }
}
