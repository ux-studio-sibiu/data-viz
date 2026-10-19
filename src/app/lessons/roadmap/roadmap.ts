import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonPage } from '../lesson-page/lesson-page';

@Component({
  selector: 'app-roadmap',
  imports: [LessonPage, RouterLink],
  templateUrl: './roadmap.html',
  styleUrl: './roadmap.scss'
})
export class Roadmap {}
