import { signal } from '@angular/core';

/** Stable document identities; selection order never determines copy order. */
export class MeasureSelection<T> {
  readonly active = signal(false);
  readonly selected = signal<ReadonlySet<T>>(new Set<T>());
  start(item: T): void { this.selected.set(new Set([item])); this.active.set(true); }
  toggle(item: T): void {
    const next = new Set(this.selected());
    if (next.has(item)) next.delete(item); else next.add(item);
    this.selected.set(next);
    if (!next.size) this.clear();
  }
  clear(): void { this.selected.set(new Set<T>()); this.active.set(false); }
}
