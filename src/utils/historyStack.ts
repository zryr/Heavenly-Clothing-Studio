/**
 * Pure, generic capped undo/redo history stack.
 * Decoupled from Canvas/DOM so it is deterministic and unit-testable.
 */
export class HistoryStack<T> {
  private items: T[] = [];
  private index: number = -1;
  private readonly maxEntries: number;

  constructor(maxEntries: number = 30) {
    this.maxEntries = Math.max(2, maxEntries);
  }

  public push(snapshot: T): void {
    // Drop any redo branch ahead of current pointer
    if (this.index < this.items.length - 1) {
      this.items = this.items.slice(0, this.index + 1);
    }
    this.items.push(snapshot);
    if (this.items.length > this.maxEntries) {
      this.items.shift();
      this.index = this.items.length - 1;
    } else {
      this.index++;
    }
  }

  public reset(initialSnapshot?: T): void {
    this.items = initialSnapshot !== undefined ? [initialSnapshot] : [];
    this.index = initialSnapshot !== undefined ? 0 : -1;
  }

  public undo(): T | null {
    if (!this.canUndo()) return null;
    this.index--;
    return this.items[this.index] ?? null;
  }

  public redo(): T | null {
    if (!this.canRedo()) return null;
    this.index++;
    return this.items[this.index] ?? null;
  }

  public current(): T | null {
    if (this.index < 0 || this.index >= this.items.length) return null;
    return this.items[this.index];
  }

  public canUndo(): boolean {
    return this.index > 0;
  }

  public canRedo(): boolean {
    return this.index >= 0 && this.index < this.items.length - 1;
  }

  public jumpTo(targetIndex: number): T | null {
    if (targetIndex < 0 || targetIndex >= this.items.length) return null;
    this.index = targetIndex;
    return this.items[this.index] ?? null;
  }

  public entries(): readonly T[] {
    return this.items;
  }

  public size(): number {
    return this.items.length;
  }

  public pointer(): number {
    return this.index;
  }
}
