import { Directive, inject } from '@angular/core';
import { Draggable } from './draggable';

const STEPS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// The part you grab. inject(Draggable) finds the nearest [nscDraggable] ancestor (≈ useContext of a parent),
// so the two directives talk without any inputs or outputs.
@Directive({
  selector: '[nscDragHandle]',
  host: { tabindex: '0', style: 'touch-action: none', '(pointerdown)': 'drag.start($event)', '(keydown)': 'onKey($event)' }
})
export class DragHandle {
  protected readonly drag = inject(Draggable);

  // Arrow keys move the host when the handle itself has focus (not a button inside it). Shift = bigger steps.
  protected onKey(e: KeyboardEvent) {
    const step = STEPS[e.key];
    if (!step || e.target !== e.currentTarget) return;
    e.preventDefault();
    const size = e.shiftKey ? 64 : 16;
    this.drag.nudge(step[0] * size, step[1] * size);
  }
}
