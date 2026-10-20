import { Component, computed, inject, input, signal } from '@angular/core';
import { Sparkline } from '../../../charts/sparkline/sparkline';
import { Boundaries } from '../../../data/boundaries';
import { latest, type MetricSeries } from '../../../data/co2';
import { Co2Data } from '../../../data/co2-data';
import { figure } from '../../../data/format';
import { ExplorerState } from '../explorer-state';

// What the sparklines show. Raw units answer "how much"; the index answers "how much has it changed".
type Mode = 'per-person' | 'total' | 'index';
const MODES: { id: Mode; label: string }[] = [
  { id: 'per-person', label: 'Per person' },
  { id: 'total', label: 'Total' },
  { id: 'index', label: '1990 = 100' }
];
// The index's base year: the reference year of the Kyoto Protocol, and late enough that almost every country has data
const BASE_YEAR = 1990;

// Up to three pinned countries side by side (lesson 14): one row each, a sparkline of CO₂ since 1900 on ONE shared scale,
// the value in the timeline's year, and a way to remove it. Small multiples rather than three lines in one chart: each
// shape stays readable, and the shared scale keeps their heights comparable.
@Component({
  selector: 'app-compare-tray',
  imports: [Sparkline],
  templateUrl: './compare-tray.html',
  styleUrl: './compare-tray.scss'
})
export class CompareTray {
  readonly year = input<number | null>(null); // the year on the map; null = the latest

  protected readonly state = inject(ExplorerState);
  private readonly boundaries = inject(Boundaries);
  private readonly co2 = inject(Co2Data);
  private readonly perCapita = this.co2.metric('co2_per_capita');
  private readonly total = this.co2.metric('co2');

  protected readonly modes = MODES;
  protected readonly mode = signal<Mode>('per-person');
  protected readonly baseYear = BASE_YEAR;

  private readonly series = computed<MetricSeries | undefined>(() => (this.mode() === 'total' ? this.total : this.perCapita).value());

  protected readonly rows = computed(() => {
    const s = this.series(), year = this.year() ?? undefined, mode = this.mode();
    if (!s) return [];
    return this.state.compared().map(id => {
      const name = this.boundaries.countries().get(id)?.name ?? id;
      const raw = s.values[id] ?? [];
      // The index divides every year by the base year: 100 = as much as in 1990, 150 = half as much again. Without a 1990
      // value there is nothing to divide by, and the row says so instead of inventing a base.
      const base = raw[BASE_YEAR - s.firstYear] ?? null;
      const values = mode === 'index' ? raw.map(v => (v === null || !base ? null : (v / base) * 100)) : raw;
      const at = latest({ ...s, values: { [id]: values } }, id, year);
      const unit = mode === 'per-person' ? ' t' : mode === 'total' ? ' Mt' : '';
      const value = mode === 'index' && !base ? `no ${BASE_YEAR} value` : at ? figure.format(at.value) + unit : 'no data';
      return { id, name, values, value, label: `${name}: ${value}` };
    });
  });

  // One y range for every row, from 0 (raw) or around the base (index). This is what makes the shapes comparable.
  protected readonly domain = computed<[number, number]>(() => {
    const all = this.rows().flatMap(r => r.values).filter((v): v is number => v !== null);
    const hi = Math.max(1, ...all);
    return this.mode() === 'index' ? [Math.min(100, ...all), Math.max(100, hi)] : [0, hi];
  });
  protected readonly firstYear = computed(() => this.series()?.firstYear ?? 1900);

  protected readonly note = computed(() =>
    this.mode() === 'index'
      ? `Each line ÷ its own ${BASE_YEAR} value: change, not size`
      : 'Since 1900, one scale for all: heights compare'
  );
}
