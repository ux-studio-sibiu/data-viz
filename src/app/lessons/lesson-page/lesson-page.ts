import { Component, input, ViewEncapsulation } from '@angular/core';

// The layout every lesson page uses. The lesson's own markup is projected in, so it carries the lesson's
// style scope, not this component's. That's why these styles are unscoped (ViewEncapsulation.None),
// contained by the nsc-lesson root class instead.
@Component({
  selector: 'app-lesson-page',
  template: `<article class="nsc-lesson"><p class="eyebrow">{{ eyebrow() }}</p><ng-content /></article>`,
  styleUrl: './lesson-page.scss',
  encapsulation: ViewEncapsulation.None
})
export class LessonPage {
  readonly eyebrow = input.required<string>();
}
