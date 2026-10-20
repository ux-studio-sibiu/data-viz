import { Component, DestroyRef, inject, input, model, signal } from '@angular/core';

const YEARS_PER_SECOND = 8; // 1900 → 2024 in about 15 s

// A year slider with a play button (lesson 12). Generic: a range of whole numbers and a two-way value.
//   <app-timeline [min]="1900" [max]="2024" [(value)]="year" />
// Playback is a GSAP tween of a plain number from the current year to the last; each time it passes a whole year, value()
// is set. Steps, not a smooth slide: the data is yearly, and a "1987.4" between two years would be invented.
@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss'
})
export class Timeline {
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly value = model.required<number>();
  readonly label = input('Year');

  protected readonly playing = signal(false);
  private tween: { kill(): void } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.tween?.kill());
  }

  protected toggle() {
    if (this.playing()) this.pause();
    else this.play();
  }

  // Dragging the slider (or the arrow keys on it) takes over from playback
  protected scrub(event: Event) {
    this.pause();
    this.value.set(Number((event.target as HTMLInputElement).value));
  }

  private async play() {
    this.playing.set(true);
    const { gsap } = await import('gsap'); // loaded on demand, like the panel reveal (lesson 11)
    if (!this.playing()) return;           // paused while GSAP was loading
    const from = this.value() >= this.max() ? this.min() : this.value(); // at the end: start again from the beginning
    const clock = { year: from };
    this.value.set(from);
    this.tween = gsap.to(clock, {
      year: this.max(),
      duration: (this.max() - from) / YEARS_PER_SECOND,
      ease: 'none', // one year takes as long as any other
      onUpdate: () => {
        const year = Math.floor(clock.year);
        if (year !== this.value()) this.value.set(year);
      },
      onComplete: () => {
        this.value.set(this.max());
        this.pause();
      }
    });
  }

  private pause() {
    this.tween?.kill();
    this.tween = null;
    this.playing.set(false);
  }
}
