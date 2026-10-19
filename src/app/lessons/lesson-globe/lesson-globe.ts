import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-globe',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-globe.html'
})
export class LessonGlobe {}
