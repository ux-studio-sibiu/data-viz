import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-divide',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-divide.html'
})
export class LessonDivide {}
