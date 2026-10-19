import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-picking',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-picking.html'
})
export class LessonPicking {}
