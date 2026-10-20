import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-compare',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-compare.html'
})
export class LessonCompare {}
