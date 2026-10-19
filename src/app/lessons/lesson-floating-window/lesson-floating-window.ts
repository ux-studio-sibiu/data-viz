import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-floating-window',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-floating-window.html'
})
export class LessonFloatingWindow {}
