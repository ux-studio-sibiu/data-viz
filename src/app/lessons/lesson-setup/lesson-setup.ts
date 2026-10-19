import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-setup',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-setup.html'
})
export class LessonSetup {}
