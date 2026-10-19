import { Component, computed, inject } from '@angular/core';
import { FlatMap } from '../../charts/flat-map/flat-map';
import { Boundaries } from '../../data/boundaries';
import { Globe } from '../../globe/globe';
import { CountrySearch } from './country-search/country-search';
import { ExplorerState } from './explorer-state';

const INCOME = { high: 'High income', 'upper-middle': 'Upper-middle income', 'lower-middle': 'Lower-middle income', low: 'Low income' };

// The product page: the globe or the flat map, filling the whole screen. The Globe / Map switch is in the app header.
// Lesson 07: hover, selection and view live in ExplorerState (selection and view in the URL), shared by both views and the search.
@Component({
  selector: 'app-explorer',
  imports: [FlatMap, Globe, CountrySearch],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class Explorer {
  protected readonly boundaries = inject(Boundaries);
  protected readonly state = inject(ExplorerState);
  protected readonly country = computed(() => this.boundaries.countries().get(this.state.hovered() ?? ''));
  protected readonly selectedCountry = computed(() => this.boundaries.countries().get(this.state.selected() ?? ''));
  protected readonly income = INCOME;
}
