type EventCallback = (...args: any[]) => void | Promise<void>;

export class EventEmitter {
  private events: Map<string, Set<EventCallback>>;

  constructor() {
    this.events = new Map();
  }

  on(event: string, callback: EventCallback): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.events.get(event)?.delete(callback);
      if (this.events.get(event)?.size === 0) {
        this.events.delete(event);
      }
    };
  }

  async emit(event: string, ...args: any[]): Promise<void> {
    const callbacks = this.events.get(event);
    if (callbacks) {
      await Promise.all(
        Array.from(callbacks).map(callback => callback(...args))
      );
    }

    // Also emit to wildcard listeners
    const wildcardCallbacks = this.events.get('*');
    if (wildcardCallbacks) {
      await Promise.all(
        Array.from(wildcardCallbacks).map(callback => callback(...args))
      );
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
} 