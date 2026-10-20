import { Component, computed, inject, input } from '@angular/core';
import { ScatterPlot, ScatterPoint } from '../../../charts/scatter-plot/scatter-plot';
import { Boundaries } from '../../../data/boundaries';
import { Co2Data } from '../../../data/co2-data';
import { FloatingPanel } from '../../../ui/floating-panel/floating-panel';
import { ExplorerState } from '../explorer-state';

const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 });
const figure = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 });
const people = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 });

// Wealth against emissions (lesson 13): GDP per person × CO₂ per person, one dot per country, sized by population and
// coloured like the map. A second view of the same countries, linked to the first through ExplorerState:
// hover a dot and the country lights up on the globe; hover the globe and the dot gets a ring; click either to select.
@Component({
  selector: 'app-scatter-panel',
  imports: [FloatingPanel, ScatterPlot],
  templateUrl: './scatter-panel.html',
  styleUrl: './scatter-panel.scss'
})
export class ScatterPanel {
  readonly year = input<number | null>(null);                        // the year on the map; null = the latest
  readonly fills = input<ReadonlyMap<string, string> | null>(null);  // the map's colours, reused for the dots

  protected readonly state = inject(ExplorerState);
  private readonly boundaries = inject(Boundaries);
  private readonly co2 = inject(Co2Data);
  private readonly gdp = this.co2.metric('gdp_per_capita');
  private readonly perCapita = this.co2.metric('co2_per_capita');
  private readonly population = this.co2.metric('population');

  // GDP ends earlier than CO₂ (2022 vs 2024). Both axes use the same year, never a mix: a 2022 GDP against 2024 emissions
  // would put each country somewhere it never was. So past GDP's last year, the chart stops there and says so.
  protected readonly chartYear = computed(() => {
    const info = this.co2.meta.value()?.metrics.find(m => m.id === 'gdp_per_capita');
    if (!info) return null;
    return Math.min(this.year() ?? info.lastYear, info.lastYear);
  });

  protected readonly points = computed<ScatterPoint[]>(() => {
    const year = this.chartYear(), gdp = this.gdp.value(), co2 = this.perCapita.value(), pop = this.population.value();
    if (year === null || !gdp || !co2 || !pop) return [];
    const at = (series: typeof gdp, id: string) => series.values[id]?.[year - series.firstYear] ?? null;
    const fills = this.fills();
    const points: ScatterPoint[] = [];
    for (const c of this.boundaries.countries().values()) {
      const x = at(gdp, c.id), y = at(co2, c.id), size = at(pop, c.id);
      // Log axes can't show 0 or less, and a country missing any of the three has no place on this chart
      if (x === null || y === null || size === null || x <= 0 || y <= 0) continue;
      points.push({ id: c.id, label: c.name, x, y, size, color: fills?.get(c.id) ?? '#e6e6e6' });
    }
    return points;
  });

  // The readout: the hovered country, else the selected one
  protected readonly active = computed(() => {
    const id = this.state.hovered() ?? this.state.selected();
    const p = this.points().find(p => p.id === id);
    return p ? { name: p.label, gdp: money.format(p.x), co2: `${figure.format(p.y)} t`, people: people.format(p.size) } : null;
  });

  // The map is on a later year than GDP reaches: say why the chart shows an older one
  protected readonly gdpEnded = computed(() => { const y = this.year(), c = this.chartYear(); return y !== null && c !== null && y > c; });
  protected readonly loading = computed(() => this.gdp.isLoading() || this.perCapita.isLoading() || this.population.isLoading());
  protected readonly label = computed(() =>
    `Scatter plot of ${this.points().length} countries in ${this.chartYear()}: GDP per person on the horizontal axis, CO₂ per person on the vertical axis, both on log scales, dot size by population.`);
}
