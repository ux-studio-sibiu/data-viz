import { computed, Injectable, signal } from '@angular/core';

export type MotionMode = 'system' | 'reduce' | 'full';

// Copied from learn-angular (services/motion-preference.ts), never linked. Adjusted: no SSR here, so no PLATFORM_ID check.
// One place that answers "should we animate?". Every animation (CSS, GSAP, Three.js) reads `reduced()`.
@Injectable({ providedIn: 'root' })
export class MotionPreference {
  private readonly mq = matchMedia('(prefers-reduced-motion: reduce)');

  private readonly systemReduced = signal(this.mq.matches);
  readonly mode = signal<MotionMode>('system'); // the user's override on this site (a toggle can come later)
  readonly reduced = computed(() => (this.mode() === 'system' ? this.systemReduced() : this.mode() === 'reduce'));

  constructor() {
    // Follow the OS setting live. A root service lives as long as the app, so no cleanup needed here.
    this.mq.addEventListener('change', e => this.systemReduced.set(e.matches));
  }
}
