import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-time',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-time.html'
})
export class LessonTime {}
