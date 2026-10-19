import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LessonWindow } from './lessons/lesson-window/lesson-window';
import { DockBar } from './ui/dock/dock-bar';

// Root component ≈ Next.js app/layout.tsx: the header, then whichever page matches the URL.
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LessonWindow, DockBar],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {}
