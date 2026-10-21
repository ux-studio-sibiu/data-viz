import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-extrusion',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-extrusion.html'
})
export class LessonExtrusion {}
