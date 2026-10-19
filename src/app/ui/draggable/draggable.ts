import { computed, Directive, ElementRef, inject, model, signal } from '@angular/core';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Makes its host movable by an offset (CSS `translate`), kept inside the viewport.
// Knows nothing about panels or lessons. The drag starts from a [nscDragHandle] inside the host.
// ≈ a small useDraggable() hook in React, or jQuery UI's .draggable({ handle, containment: 'window' })
@Directive({
  selector: '[nscDraggable]',
  host: { '[style.translate]': 'translate()', '[class.is-dragging]': 'dragging()', '(window:resize)': 'reclamp()' }
})
export class Draggable {
  readonly position = model({ x: 0, y: 0 }); // two-way: [(position)]="saved"
  readonly dragging = signal(false);
  protected readonly translate = computed(() => `${this.position().x}px ${this.position().y}px`);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  // Called by DragHandle. Pointer capture keeps the moves coming even when the pointer leaves the handle.
  start(e: PointerEvent) {
    if (e.button !== 0 || (e.target as Element).closest('button, a, input, select, textarea')) return;
    const handle = e.currentTarget as HTMLElement, from = this.position(), b = this.bounds(), sx = e.clientX, sy = e.clientY;
    // Bounds are measured once: during the drag the DOM lags a frame behind the signal, so re-measuring would drift
    const move = (m: PointerEvent) => this.position.set({ x: clamp(from.x + m.clientX - sx, b.minX, b.maxX), y: clamp(from.y + m.clientY - sy, b.minY, b.maxY) });
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      this.dragging.set(false);
    };
    handle.setPointerCapture(e.pointerId);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    this.dragging.set(true);
    e.preventDefault(); // no text selection while dragging
  }

  nudge(dx: number, dy: number) { const p = this.position(); this.moveTo(p.x + dx, p.y + dy); }
  reclamp() { const p = this.position(); this.moveTo(p.x, p.y); } // after a window resize, or when the host becomes visible

  private moveTo(x: number, y: number) {
    const b = this.bounds();
    this.position.set({ x: clamp(x, b.minX, b.maxX), y: clamp(y, b.minY, b.maxY) });
  }

  // How far the current offset may change before an edge leaves the viewport
  private bounds() {
    const r = this.host.getBoundingClientRect(), p = this.position();
    return { minX: p.x - r.left, maxX: p.x + innerWidth - r.right, minY: p.y - r.top, maxY: p.y + innerHeight - r.bottom };
  }
}
