import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-countries-globe',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-countries-globe.html'
})
export class LessonCountriesGlobe {}
