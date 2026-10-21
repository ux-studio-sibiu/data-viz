import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-lesson-story',
  imports: [LessonPage, RouterLink],
  templateUrl: './lesson-story.html'
})
export class LessonStory {}
