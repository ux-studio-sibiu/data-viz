import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-flat-map',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-flat-map.html'
})
export class LessonFlatMap {}
