import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-scatter',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-scatter.html'
})
export class LessonScatter {}
