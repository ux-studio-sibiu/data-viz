import { Component, computed, inject, untracked } from '@angular/core';
import { choropleth } from '../../charts/choropleth';
import { FlatMap } from '../../charts/flat-map/flat-map';
import { Legend } from '../../charts/legend/legend';
import { Boundaries } from '../../data/boundaries';
import { Co2Data } from '../../data/co2-data';
import { Globe } from '../../globe/globe';
import { CountryDetail } from './country-detail/country-detail';
import { CountrySearch } from './country-search/country-search';
import { ExplorerState, MAP_METRICS } from './explorer-state';

// Short units for tooltips and the legend (OWID's are long: "tonnes per person (t/person)")
const SHORT_UNIT: Record<string, string> = {
  co2_per_capita: 't per person',
  co2: 'Mt per year',
  share_global_cumulative_co2: '% of all CO₂ since 1750',
  consumption_co2_per_capita: 't per person',
  gdp_per_capita: '$ per person (2011 prices)'
};
const figure = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 }); // 4.07, 270, 23.5: as precise as the data deserves

// The product page: the globe or the flat map, filling the whole screen. The Globe / Map switch is in the app header.
// Lesson 07: hover, selection and view live in ExplorerState (selection and view in the URL), shared by both views and the search.
// Lesson 08: the selection card shows the country's latest CO₂ figures.
// Lesson 09: both views coloured by a metric (?metric=), with a legend.
// Lesson 11: the selection card becomes CountryDetail, with the country's history.
@Component({
  selector: 'app-explorer',
  imports: [FlatMap, Globe, CountrySearch, CountryDetail, Legend],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class Explorer {
  protected readonly boundaries = inject(Boundaries);
  protected readonly state = inject(ExplorerState);
  protected readonly co2 = inject(Co2Data);
  protected readonly country = computed(() => this.boundaries.countries().get(this.state.hovered() ?? ''));
  protected readonly selectedCountry = computed(() => this.boundaries.countries().get(this.state.selected() ?? ''));

  // --- lesson 09: the choropleth -------------------------------------------------------------------------------------
  protected readonly mapMetrics = computed(() => (this.co2.meta.value()?.metrics ?? []).filter(m => MAP_METRICS.includes(m.id)));
  protected readonly metricInfo = computed(() => this.co2.meta.value()?.metrics.find(m => m.id === this.state.metric()));

  // The chosen metric's resource. Co2Data.metric() creates it the first time (starting a request), so it runs in untracked():
  // creating resources is a side effect, not allowed while a computed is tracking. The computed still re-runs when the metric changes.
  private readonly mapSeries = computed(() => {
    const id = this.state.metric();
    return untracked(() => this.co2.metric(id));
  });

  // Every country's colour for the metric's latest year, plus the legend's classes. Recomputed when the metric or its data changes.
  protected readonly map = computed(() => {
    const series = this.mapSeries().value(), info = this.metricInfo();
    return series && info ? choropleth(series, info.lastYear) : null;
  });

  // The hovered country's value, for the tooltips
  protected readonly hoveredValue = computed(() => {
    const id = this.state.hovered(), map = this.map();
    const v = id && map ? map.values.get(id) : undefined;
    return v === undefined ? 'no data' : `${figure.format(v)} ${this.shortUnit()}`;
  });
  protected readonly shortUnit = computed(() => SHORT_UNIT[this.state.metric()] ?? '');

}
