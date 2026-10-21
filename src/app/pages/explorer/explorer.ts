import { Component, computed, inject, untracked } from '@angular/core';
import { BRWNYL_8, choropleth } from '../../charts/choropleth';
import { PieChart, type PieSlice } from '../../charts/pie-chart/pie-chart';
import { FlatMap } from '../../charts/flat-map/flat-map';
import { Legend } from '../../charts/legend/legend';
import { Boundaries } from '../../data/boundaries';
import { figure } from '../../data/format';
import { Co2Data } from '../../data/co2-data';
import { Globe } from '../../globe/globe';
import { CountryDetail } from './country-detail/country-detail';
import { CountrySearch } from './country-search/country-search';
import { ScatterView } from './scatter-view/scatter-view';
import { CompareTray } from './compare-tray/compare-tray';
import { IncomeMeter } from './income-meter/income-meter';
import { Timeline } from '../../ui/timeline/timeline';
import { Backdrop } from '../../ui/backdrop/backdrop';
import { ExplorerState, MAP_METRICS, METRIC_BREAKS } from './explorer-state';

// Short units for tooltips and the legend (OWID's are long: "tonnes per person (t/person)")
// Lesson 15: extrusion raises only the countries that together emit this share of the year's total
const TOP_SHARE = 0.9;
// The pie names the largest few; the rest of the raised countries share one slice, everyone else another
const PIE_TOP = 5;
const PIE_GREYS = ['#141414', '#333333', '#4f4f4f', '#6b6b6b', '#878787'];
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
// Lesson 15: on the globe, countries rise by their total CO₂ (?extrude=1).
@Component({
  selector: 'app-explorer',
  imports: [FlatMap, Globe, CountrySearch, CountryDetail, Legend, Timeline, Backdrop, ScatterView, IncomeMeter, CompareTray, PieChart],
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

  // --- lesson 15: extrusion ----------------------------------------------------------------------------------------------
  // Height = total CO₂ per year, whatever the colours show: size (how much a country emits) on top of the chosen metric.
  private readonly totals = this.co2.metric('co2');
  // The largest total in ANY year: one fixed scale, so playing the timeline shows countries rising, as with the colours'
  // fixed class breaks (lesson 12). Linear, like bars: twice the emissions, twice the height.
  protected readonly tallest = computed(() => {
    const s = this.totals.value();
    if (!s) return null;
    let max = 0, id = '';
    for (const c of this.boundaries.countries().keys()) for (const v of s.values[c] ?? []) if (v !== null && v > max) { max = v; id = c; }
    return max ? { value: max, name: this.boundaries.countries().get(id)?.name ?? id } : null;
  });
  // Only the biggest emitters stand up: the fewest countries that together make TOP_SHARE of the year's total. In 2024
  // that's 33 of 212; in 1900, 10 of 69. The rest stay flat, so the columns say "these few emit nearly all of it".
  protected readonly raised = computed(() => {
    const s = this.totals.value(), year = this.year(), tallest = this.tallest();
    if (!this.state.extrude() || !s || year === null || !tallest) return null;
    const emitters = [...this.boundaries.countries().keys()]
      .map(id => ({ id, v: s.values[id]?.[year - s.firstYear] ?? 0 }))
      .filter(e => e.v > 0)
      .sort((a, b) => b.v - a.v);
    const total = emitters.reduce((sum, e) => sum + e.v, 0);
    const heights = new Map<string, number>();
    let sum = 0;
    for (const e of emitters) {
      if (sum >= TOP_SHARE * total) break; // the share is reached: everyone smaller stays flat
      heights.set(e.id, e.v / tallest.value);
      sum += e.v;
    }
    // The pie above the switch: the largest few, the rest of the raised countries, and everyone else, as shares of the
    // year's total. Greys, darkest first, like the columns.
    const share = (v: number) => `${Math.round((v / total) * 100)}%`;
    const top = emitters.slice(0, Math.min(PIE_TOP, heights.size));
    const club = emitters.slice(PIE_TOP, heights.size).reduce((t, e) => t + e.v, 0);
    // On the slices, a long name gives way to its code ("USA"); the key under the pie keeps the full name
    const named = (id: string) => this.boundaries.countries().get(id)?.name ?? id;
    const slices: PieSlice[] = top.map((e, i) => ({ label: named(e.id), short: named(e.id).length > 12 ? e.id : undefined, value: e.v, color: PIE_GREYS[i], note: share(e.v) }));
    if (heights.size > PIE_TOP) slices.push({ label: `${heights.size - PIE_TOP} others raised`, short: `${heights.size - PIE_TOP} others`, value: club, color: '#a8a8a8', note: share(club) });
    slices.push({ label: `${emitters.length - heights.size} others`, value: total - sum, color: '#e4e4e4', note: share(total - sum) });
    return { heights, count: heights.size, of: emitters.length, slices };
  });
  protected readonly heights = computed(() => this.raised()?.heights ?? null);
  protected readonly pieLabel = computed(() => `Shares of the world's CO₂ in ${this.year()}: the largest emitters, the other raised countries, everyone else`);
  protected format(n: number) { return figure.format(n); }

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
    return series && info && year !== null ? choropleth(series, year, info.lastYear, BRWNYL_8, METRIC_BREAKS[info.id] ?? 'quantile') : null;
  });

  protected readonly shortUnit = computed(() => SHORT_UNIT[this.state.metric()] ?? '');

}
