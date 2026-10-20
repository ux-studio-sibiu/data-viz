import { Component, computed, inject, untracked } from '@angular/core';
import { choropleth } from '../../charts/choropleth';
import { FlatMap } from '../../charts/flat-map/flat-map';
import { Legend } from '../../charts/legend/legend';
import { Boundaries } from '../../data/boundaries';
import { Co2Data } from '../../data/co2-data';
import { Globe } from '../../globe/globe';
import { CountryDetail } from './country-detail/country-detail';
import { CountrySearch } from './country-search/country-search';
import { ScatterView } from './scatter-view/scatter-view';
import { CompareTray } from './compare-tray/compare-tray';
import { IncomeMeter } from './income-meter/income-meter';
import { Timeline } from '../../ui/timeline/timeline';
import { Backdrop } from '../../ui/backdrop/backdrop';
import { ExplorerState, MAP_METRICS } from './explorer-state';

// Short units for tooltips and the legend (OWID's are long: "tonnes per person (t/person)")
const SHORT_UNIT: Record<string, string> = {
  co2_per_capita: 't per person',
  co2: 'Mt per year',
  share_global_cumulative_co2: '% of all CO₂ since 1750',
  consumption_co2_per_capita: 't per person',
  gdp_per_capita: '$ per person (2011 prices)'
};

// The product page: the globe or the flat map, filling the whole screen. The Globe / Map switch is in the app header.
// Lesson 07: hover, selection and view live in ExplorerState (selection and view in the URL), shared by both views and the search.
// Lesson 08: the selection card shows the country's latest CO₂ figures.
// Lesson 09: both views coloured by a metric (?metric=), with a legend.
// Lesson 11: the selection card becomes CountryDetail, with the country's history.
// Lesson 12: a year slider with playback (?year=); the map, the panel and the tooltips follow it.
// Lesson 13: a scatter plot of wealth × emissions, a third view beside the globe and the map (?view=scatter).
// Lesson 14: up to three countries pinned side by side in a compare tray (?compare=).
@Component({
  selector: 'app-explorer',
  imports: [FlatMap, Globe, CountrySearch, CountryDetail, Legend, Timeline, Backdrop, ScatterView, IncomeMeter, CompareTray],
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

  // --- lesson 12: time ------------------------------------------------------------------------------------------------
  // The slider runs from the data's first year to the metric's last (2024 for CO₂, 2022 for GDP)
  protected readonly yearRange = computed(() => {
    const meta = this.co2.meta.value(), info = this.metricInfo();
    return meta && info ? { min: meta.firstYear, max: info.lastYear } : null;
  });
  // The year on screen: ?year= clamped to the range (a link from another metric may point past its last year), else the latest
  protected readonly year = computed(() => {
    const range = this.yearRange();
    return range ? Math.min(range.max, Math.max(range.min, this.state.year() ?? range.max)) : null;
  });
  protected setYear(year: number) { this.state.showYear(year === this.yearRange()?.max ? null : year); }

  // Every country's colour in the chosen year, plus the legend's classes. The breaks always come from the latest year (lesson 12).
  protected readonly map = computed(() => {
    const series = this.mapSeries().value(), info = this.metricInfo(), year = this.year();
    return series && info && year !== null ? choropleth(series, year, info.lastYear) : null;
  });

  protected readonly shortUnit = computed(() => SHORT_UNIT[this.state.metric()] ?? '');

}
