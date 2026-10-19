import { Injectable } from '@angular/core';

export type PanelState = { x: number; y: number; w?: number; h?: number };

// Remembers each panel's position and size between visits. localStorage can be missing or throw
// (private mode, blocked storage), so every access is wrapped and the panel just falls back to its defaults.
@Injectable({ providedIn: 'root' })
export class PanelMemory {
  private readonly timers = new Map<string, number>();

  load(id: string): PanelState | null {
    try { return JSON.parse(localStorage.getItem(`panel:${id}`) ?? 'null'); } catch { return null; }
  }

  // Debounced: dragging and resizing change the state many times per second, storage only needs the last one
  save(id: string, state: PanelState) {
    clearTimeout(this.timers.get(id));
    this.timers.set(id, window.setTimeout(() => {
      try { localStorage.setItem(`panel:${id}`, JSON.stringify(state)); } catch {}
    }, 250));
  }
}
