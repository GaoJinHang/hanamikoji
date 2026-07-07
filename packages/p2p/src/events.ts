export type RuntimeUnsubscribe = () => void;

export class RuntimeEventEmitter<Events extends { [K in keyof Events]: (...args: any[]) => void }> {
  private readonly handlers = new Map<keyof Events, Set<Events[keyof Events]>>();

  on<EventName extends keyof Events>(eventName: EventName, handler: Events[EventName]): RuntimeUnsubscribe {
    const existing = this.handlers.get(eventName) ?? new Set<Events[keyof Events]>();
    existing.add(handler);
    this.handlers.set(eventName, existing);
    return () => {
      existing.delete(handler);
    };
  }

  protected emit<EventName extends keyof Events>(eventName: EventName, ...args: Parameters<Events[EventName]>): void {
    const listeners = this.handlers.get(eventName);
    if (!listeners) return;
    for (const handler of [...listeners]) {
      (handler as Events[EventName])(...args);
    }
  }
}
