import { afterNextRender, Component, DestroyRef, effect, ElementRef, HostAttributeToken, inject, Injector, input, model, output, signal, viewChild } from '@angular/core';
import { Dock } from '../dock/dock';
import { Draggable } from '../draggable/draggable';
import { DragHandle } from '../draggable/drag-handle';
import { PanelMemory } from './panel-memory';

// A movable, resizable, minimizable window. Generic: the content comes in through ng-content slots.
//   <app-floating-panel panel-id="notes" label="Notes" (closed)="…">
//     <span panel-title>Notes</span>
//     <button panel-actions>…</button>
//     …body…
//   </app-floating-panel>
// Non-modal on purpose: the page behind stays usable.
@Component({
  selector: 'app-floating-panel',
  imports: [Draggable, DragHandle],
  templateUrl: './floating-panel.html',
  styleUrl: './floating-panel.scss'
})
export class FloatingPanel {
  readonly label = input.required<string>(); // for screen readers and the dock
  readonly minimized = model(false);
  readonly defaultSize = input<{ w: number; h: number } | null>(null); // until the user resizes it (then the remembered size wins)
  readonly closed = output();

  // A static attribute, read once in the constructor (inputs aren't set yet there). It never changes, so it doesn't need to be an input.
  private readonly id = inject(new HostAttributeToken('panel-id'));
  private readonly memory = inject(PanelMemory);
  private readonly dock = inject(Dock);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly drag = viewChild.required(Draggable);
  private readonly saved = this.memory.load(this.id);

  protected readonly position = signal({ x: this.saved?.x ?? 0, y: this.saved?.y ?? 0 });
  protected readonly size = signal(this.saved?.w && this.saved.h ? { w: this.saved.w, h: this.saved.h } : null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => this.memory.save(this.id, { ...this.position(), ...this.size() }));
    effect(() => {
      if (this.minimized()) this.dock.add({ id: this.id, label: this.label(), restore: () => this.restore() });
      else this.dock.remove(this.id);
    });

    // CSS `resize: both` does the resizing; a ResizeObserver reports the new size so it can be remembered.
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize[0];
        if (box.inlineSize > 0) this.size.set({ w: Math.round(box.inlineSize), h: Math.round(box.blockSize) }); // 0 = hidden, ignore
      });
      observer.observe(this.dialog().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect()); // inject() only works in the constructor, so destroyRef is captured above
      this.drag().reclamp(); // the saved position may be off-screen on a smaller viewport
    });
    destroyRef.onDestroy(() => this.dock.remove(this.id));
  }

  restore() {
    this.minimized.set(false);
    afterNextRender(() => this.drag().reclamp(), { injector: this.injector }); // measure once it's visible again
  }
}
