import { Injectable, signal } from '@angular/core';

export type DockItem = { id: string; label: string; restore: () => void };

// The list of minimized windows. Panels add themselves when minimized; DockBar renders the list.
// A root service is the meeting point because the panel and the bar live far apart in the component tree.
@Injectable({ providedIn: 'root' })
export class Dock {
  private readonly list = signal<DockItem[]>([]);
  readonly items = this.list.asReadonly();

  add(item: DockItem) { this.list.update(items => [...items.filter(i => i.id !== item.id), item]); }
  remove(id: string) { this.list.update(items => items.filter(i => i.id !== id)); }
}
