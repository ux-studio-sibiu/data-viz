import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, input, signal, untracked } from '@angular/core';
import { ChartLine, LineChart } from '../../../charts/line-chart/line-chart';
import { Boundaries } from '../../../data/boundaries';
import { lastIndexWithValue, latest, medianSeries, rankIn } from '../../../data/co2';
import { Co2Data } from '../../../data/co2-data';
import { figure } from '../../../data/format';
import { INCOME_ADJECTIVE, INCOME_LABEL, type Country } from '../../../data/country';
import { MotionPreference } from '../../../shared/motion-preference';
import { ExplorerState, MAX_COMPARED } from '../explorer-state';
import { IncomeMeter } from '../income-meter/income-meter';


// What the chart plots. Per person and in total tell different stories: China tops the totals, Qatar the per-person figures.
type Mode = 'co2_per_capita' | 'co2';
const MODES: { id: Mode; label: string; unit: string; noun: string }[] = [
  { id: 'co2_per_capita', label: 'Per person', unit: 't', noun: 'CO₂ per person' },
  { id: 'co2', label: 'Total', unit: 'Mt', noun: 'CO₂ per year' }
];

// The selected country in detail (lesson 11): who it is, its latest CO₂ figures (lesson 08), its history since 1900
// next to its income-group peers, and where it ranks among them.
@Component({
  selector: 'app-country-detail',
  imports: [LineChart, IncomeMeter],
  templateUrl: './country-detail.html',
  styleUrl: './country-detail.scss',
  host: { '[class.is-visible]': 'visible()' } // the whole panel, frame included, fades in on this (first open)
})
export class CountryDetail {
  readonly country = input.required<Country>();
  readonly year = input<number | null>(null); // lesson 12: the year on the map; null = the latest

  // First open: hidden until the CO₂ data is in and drawn, then the whole panel fades in at once. Showing it straight away
  // flickered: the frame and "Loading…" for a frame or two, then the figures and the chart popping in under them.
  protected readonly visible = signal(false);

  protected readonly boundaries = inject(Boundaries);
  protected readonly state = inject(ExplorerState);
  private readonly co2 = inject(Co2Data);
  private readonly motion = inject(MotionPreference);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  // The country on screen. It trails the input during a swap: the old country stays until it has faded out.
  private readonly shown = signal<Country | null>(null);
  protected readonly current = computed(() => this.shown() ?? this.country());
  private swapping = false;

  protected readonly income = INCOME_LABEL;

  // Lesson 14: this country in the compare tray, and whether the tray has room for another
  protected readonly pinned = computed(() => this.state.compared().includes(this.current().id));
  protected readonly trayFull = computed(() => this.state.compared().length >= MAX_COMPARED);
  protected readonly modes = MODES;

  // Shared with the map through Co2Data: one request each, whoever asks first
  private readonly perCapita = this.co2.metric('co2_per_capita');
  private readonly total = this.co2.metric('co2');
  private readonly historicShare = this.co2.metric('share_global_cumulative_co2');

  // --- lesson 08: the latest figures, each with its own year -------------------------------------------------------------
  protected readonly readings = computed(() => {
    const id = this.current().id;
    const year = this.year() ?? undefined; // the latest value at or before the year on the map
    return { perCapita: latest(this.perCapita.value(), id, year), total: latest(this.total.value(), id, year), historicShare: latest(this.historicShare.value(), id, year) };
  });
  // The year shown once above the figures: per person's, else the total's. A figure from another year shows its own.
  protected readonly figuresYear = computed(() => {
    const r = this.readings();
    return (r.perCapita ?? r.total ?? r.historicShare)?.year ?? null;
  });
  protected readonly loading = computed(() => this.perCapita.isLoading() || this.total.isLoading() || this.historicShare.isLoading());
  protected readonly failed = computed(() => !!(this.perCapita.error() || this.total.error() || this.historicShare.error()));

  // --- lesson 11: the history chart --------------------------------------------------------------------------------------
  // Local, not in the URL: a way of looking at this panel, not something worth sharing in a link
  protected readonly mode = signal<Mode>('co2_per_capita');
  protected readonly modeInfo = computed(() => MODES.find(m => m.id === this.mode())!);
  private readonly series = computed(() => (this.mode() === 'co2' ? this.total : this.perCapita).value());

  // The peers: every country in the same income group (Natural Earth's World Bank classification, lesson 02)
  protected readonly peers = computed(() => {
    const group = this.current().incomeGroup;
    return group ? [...this.boundaries.countries().values()].filter(c => c.incomeGroup === group).map(c => c.id) : [];
  });

  protected readonly chart = computed(() => {
    const s = this.series(), c = this.current(), own = s?.values[c.id];
    if (!s || !own) return null;
    const lines: ChartLine[] = [{ id: c.id, label: c.id, values: own }]; // short labels keep the readout on one line; the rank below names the group
    if (c.incomeGroup && this.peers().length >= 3) {
      lines.push({ id: 'peers', label: 'median', values: medianSeries(s, this.peers()), reference: true });
    }
    return { firstYear: s.firstYear, lines, label: this.describe(c, own, s.firstYear) };
  });

  // "3 of 58 high-income countries, 2024" (1 = the highest), for the chart's metric and the year on the map
  protected readonly rank = computed(() => {
    const s = this.series(), c = this.current(), last = latest(s, c.id, this.year() ?? undefined);
    if (!s || !last || !c.incomeGroup) return null;
    const r = rankIn(s, this.peers(), c.id, last.year);
    return r && { ...r, year: last.year, group: INCOME_ADJECTIVE[c.incomeGroup] };
  });

  constructor() {
    // The panel reveal (moved here from lesson 10): the old content fades out, is swapped while the panel is blank, and the
    // new content fades in. The frame (border, hatched shadow) stays put.
    effect(() => {
      const next = this.country();
      untracked(() => this.swap(next));
    });
    // Once the data has arrived (or failed: the panel then shows why), wait for that render, then show the panel. Once only.
    effect(() => {
      if (this.visible() || this.loading()) return;
      afterNextRender(() => this.visible.set(true), { injector: this.injector });
    });
  }

  protected format(n: number) { return figure.format(n); }
  protected readonly peerDigits = computed(() => String(this.peers().length).length); // the widest a rank or a count can be

  private async swap(next: Country) {
    const first = !this.shown();
    if (first || this.motion.reduced()) {
      this.shown.set(next); // the first country goes straight in: the panel is still hidden, the reveal is the panel's fade-in
      return;
    }
    if (next === this.shown() || this.swapping) return; // a fade-out already running picks up the latest country when it ends
    this.swapping = true;
    const gsap = await this.gsap();
    gsap.to(this.content(), {
      opacity: 0, duration: 0.25, ease: 'sine.in', overwrite: true, // overwrite: stops a fade-in still running
      onComplete: () => {
        this.swapping = false;
        this.shown.set(this.country()); // the latest selection, even if it changed during the fade
        this.fadeInAfterRender();
      }
    });
  }

  // afterNextRender: setting shown() only schedules the DOM update. Fading in before it would show the old country for a frame.
  private fadeInAfterRender() {
    afterNextRender(async () => {
      if (this.motion.reduced()) return;
      const gsap = await this.gsap();
      gsap.fromTo(this.content(), { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'sine.out', overwrite: true, clearProps: 'opacity' });
    }, { injector: this.injector });
  }

  private content() { return this.host.querySelector('.nsc-country-detail'); }

  // GSAP is loaded on demand: the globe's chunk brings it anyway, but the flat map shouldn't pull it into the first download
  private async gsap() { return (await import('gsap')).gsap; }

  // The chart's text alternative: the first and latest values, so a screen reader gets the trend without the picture
  private describe(c: Country, values: (number | null)[], firstYear: number) {
    const { noun, unit } = this.modeInfo();
    const first = values.findIndex(v => v !== null), last = lastIndexWithValue(values);
    if (first < 0) return `${noun} in ${c.name}: no data.`;
    return `${noun} in ${c.name}, ${firstYear + first} to ${firstYear + last}: from ${figure.format(values[first]!)} ${unit} to ${figure.format(values[last]!)} ${unit}.`;
  }
}
