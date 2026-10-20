import { Component, computed, inject, input } from '@angular/core';
import { ScatterPlot, ScatterPoint } from '../../../charts/scatter-plot/scatter-plot';
import { Boundaries } from '../../../data/boundaries';
import { Co2Data } from '../../../data/co2-data';
import { figure, money, people } from '../../../data/format';
import { ExplorerState } from '../explorer-state';


// Wealth against emissions (lesson 13): GDP per person × CO₂ per person, one dot per country, sized by population and
// coloured like the map. A third view beside the globe and the map (?view=scatter), filling the stage like them.
// It shares ExplorerState with them: a dot clicked here is the selection there (the panel opens; switch to the globe
// and it flies to it), and the timeline and the metric's colours apply here too.
// (It started as a floating window over the globe; as a full view it has room to read, and one place to open it.)
@Component({
  selector: 'app-scatter-view',
  imports: [ScatterPlot],
  templateUrl: './scatter-view.html',
  styleUrl: './scatter-view.scss'
})
export class ScatterView {
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

  // The axes and the dot sizes over EVERY year the chart can show (from the first year with GDP to its last), not just the
  // one on screen. Playing the timeline then moves the dots against a still grid: a country getting richer slides right.
  // Fitted to each year instead, the axes rescaled every step and everything seemed to move at once, including the grid.
  protected readonly ranges = computed(() => {
    const gdp = this.gdp.value(), co2 = this.perCapita.value(), pop = this.population.value();
    if (!gdp || !co2 || !pop) return null;
    let xLo = Infinity, xHi = 0, yLo = Infinity, yHi = 0, sizeHi = 0;
    for (const c of this.boundaries.countries().values()) {
      const gx = gdp.values[c.id], cy = co2.values[c.id], ps = pop.values[c.id];
      if (!gx || !cy || !ps) continue;
      for (let i = 0; i < gx.length; i++) {
        const year = gdp.firstYear + i, x = gx[i], y = cy[year - co2.firstYear], size = ps[year - pop.firstYear];
        if (x === null || y === null || y === undefined || size === null || size === undefined || x <= 0 || y <= 0) continue;
        xLo = Math.min(xLo, x); xHi = Math.max(xHi, x);
        yLo = Math.min(yLo, y); yHi = Math.max(yHi, y);
        sizeHi = Math.max(sizeHi, size);
      }
    }
    return sizeHi ? { x: [xLo, xHi] as [number, number], y: [yLo, yHi] as [number, number], sizeMax: sizeHi } : null;
  });

  // The tooltip: the hovered country
  protected readonly active = computed(() => {
    const id = this.state.hovered();
    const p = this.points().find(p => p.id === id);
    return p ? { name: p.label, gdp: money.format(p.x), co2: `${figure.format(p.y)} t`, people: people.format(p.size) } : null;
  });

  protected readonly loading = computed(() => this.gdp.isLoading() || this.perCapita.isLoading() || this.population.isLoading());
  protected readonly label = computed(() =>
    `Scatter plot of ${this.points().length} countries in ${this.chartYear()}: GDP per person on the horizontal axis, CO₂ per person on the vertical axis, both on log scales, dot size by population.`);
}
