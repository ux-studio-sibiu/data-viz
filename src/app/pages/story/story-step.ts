import { Directive, ElementRef, inject, input } from '@angular/core';
import type { View } from '../explorer/explorer-state';

// What the stage shows while a step is in view. Anything left out goes back to the explorer's default, so a step never
// inherits the one before it: scrolling back up restores the earlier step exactly.
export type StoryState = { view?: View; metric?: string; year?: number; country?: string; extrude?: boolean };

// Marks an element of the story as a step, with the state it puts on the stage (lesson 17). The content stays in the
// template, where it belongs; the story page only needs the element (for ScrollTrigger) and the state.
//   <section [storyStep]="{ year: 1950, metric: 'co2' }">…</section>
@Directive({ selector: '[storyStep]' })
export class StoryStep {
  readonly storyStep = input.required<StoryState>();
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
}
