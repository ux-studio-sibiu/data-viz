import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-choropleth',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-choropleth.html'
})
export class LessonChoropleth {}
