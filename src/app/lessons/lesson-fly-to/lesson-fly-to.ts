import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-fly-to',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-fly-to.html'
})
export class LessonFlyTo {}
