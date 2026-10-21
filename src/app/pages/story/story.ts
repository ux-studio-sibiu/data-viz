import { afterNextRender, Component, DestroyRef, inject, signal, viewChildren } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Explorer } from '../explorer/explorer';
import { StoryStep } from './story-step';

gsap.registerPlugin(ScrollTrigger);

// The scroll-driven story (lesson 17): a column of short steps scrolling over the explorer, which sits fixed behind them
// in story mode (read-only). Scroll a step to the middle of the screen and the stage shows its state.
//
// ScrollTrigger only says WHICH step is active. The step writes its state into the same URL-backed store as every
// control (lesson 07), and the explorer draws it with the animations it already has: the globe flies to a country,
// colours crossfade between years, columns grow. The story adds no animation of its own.
@Component({
  selector: 'app-story',
  imports: [Explorer, StoryStep, RouterLink],
  templateUrl: './story.html',
  styleUrl: './story.scss'
})
export class Story {
  private readonly router = inject(Router);
  private readonly steps = viewChildren(StoryStep);
  protected readonly active = signal(0);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.show(0); // before any scrolling: the first step's state
      // A step is active while it straddles the line 55% down the screen, a little below the middle, where the eye reads.
      // onToggle fires on entering and leaving that span, from either direction, so scrolling back up works the same.
      const triggers = this.steps().map((step, i) =>
        ScrollTrigger.create({
          trigger: step.element,
          start: 'top 55%',
          end: 'bottom 55%',
          onToggle: self => { if (self.isActive) this.show(i); }
        })
      );
      destroyRef.onDestroy(() => triggers.forEach(t => t.kill()));
    });
  }

  // The whole state, every time: a value a step leaves out is removed from the URL (null), so it falls back to the default
  private show(i: number) {
    if (i === this.active() && i !== 0) return;
    this.active.set(i);
    const s = this.steps()[i]?.storyStep();
    if (!s) return;
    this.router.navigate([], {
      queryParams: {
        view: s.view && s.view !== 'globe' ? s.view : null,
        metric: s.metric ?? null,
        year: s.year ?? null,
        country: s.country ?? null,
        extrude: s.extrude ? '1' : null,
        compare: null
      },
      replaceUrl: true // scrolling isn't navigating: the back button leaves the story, it doesn't rewind it
    });
  }
}
