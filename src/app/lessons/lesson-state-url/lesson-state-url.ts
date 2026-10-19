import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-state-url',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-state-url.html'
})
export class LessonStateUrl {}
