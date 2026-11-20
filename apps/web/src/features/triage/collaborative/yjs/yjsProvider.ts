/**
 * Mock Yjs provider (#2192).
 *
 * Simulates the Yjs WebSocket/WebRTC provider that syncs CRDT documents
 * between collaborators. No actual yjs dependency — uses an in-memory
 * event-driven model that mimics the real CRDT merge behavior.
 */

type UpdateCallback = (update: unknown) => void;
type StateCallback = () => void;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

// ── Mock CRDT types ──────────────────────────────────────────────────────────

export class MockYArray<T> {
  private items: T[] = [];
  private observers: Set<() => void> = new Set();

  insert(index: number, value: T): void {
    this.items.splice(index, 0, value);
    this.observers.forEach((cb) => cb());
  }

  push(value: T): void {
    this.items.push(value);
    this.observers.forEach((cb) => cb());
  }

  delete(index: number, length: number = 1): void {
    this.items.splice(index, length);
    this.observers.forEach((cb) => cb());
  }

  get(index: number): T | undefined {
    return this.items[index];
  }

  forEach(fn: (value: T, index: number) => void): void {
    this.items.forEach(fn);
  }

  toArray(): T[] {
    return [...this.items];
  }

  get length(): number {
    return this.items.length;
  }

  observe(cb: () => void): () => void {
    this.observers.add(cb);
    return () => this.observers.delete(cb);
  }
}

export class MockYText {
  private text = '';
  private observers: Set<(delta: unknown) => void> = new Set();

  insert(index: number, text: string): void {
    this.text = this.text.slice(0, index) + text + this.text.slice(index);
    this.observers.forEach((cb) => cb({ type: 'insert', index, text }));
  }

  delete(index: number, length: number): void {
    this.text = this.text.slice(0, index) + this.text.slice(index + length);
    this.observers.forEach((cb) => cb({ type: 'delete', index, length }));
  }

  toString(): string {
    return this.text;
  }

  get length(): number {
    return this.text.length;
  }

  observe(cb: (delta: unknown) => void): () => void {
    this.observers.add(cb);
    return () => this.observers.delete(cb);
  }
}

export class MockYMap<V> {
  private map = new Map<string, V>();
  private observers: Set<() => void> = new Set();

  set(key: string, value: V): void {
    this.map.set(key, value);
    this.observers.forEach((cb) => cb());
  }

  get(key: string): V | undefined {
    return this.map.get(key);
  }

  delete(key: string): void {
    this.map.delete(key);
    this.observers.forEach((cb) => cb());
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  forEach(fn: (value: V, key: string) => void): void {
    this.map.forEach(fn);
  }

  get size(): number {
    return this.map.size;
  }

  observe(cb: () => void): () => void {
    this.observers.add(cb);
    return () => this.observers.delete(cb);
  }
}

// ── Mock Yjs Document ─────────────────────────────────────────────────────────

export class MockYDoc {
  private arrays = new Map<string, MockYArray<unknown>>();
  private texts = new Map<string, MockYText>();
  private maps = new Map<string, MockYMap<unknown>>();
  private updateCallbacks: Set<UpdateCallback> = new Set();
  private connectionState: ConnectionState = 'disconnected';
  private stateCallbacks: Set<StateCallback> = new Set();
  readonly roomId: string;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  getArray<T>(name: string): MockYArray<T> {
    if (!this.arrays.has(name)) {
      this.arrays.set(name, new MockYArray<T>());
    }
    return this.arrays.get(name) as MockYArray<T>;
  }

  getText(name: string): MockYText {
    if (!this.texts.has(name)) {
      this.texts.set(name, new MockYText());
    }
    return this.texts.get(name)!;
  }

  getMap<V>(name: string): MockYMap<V> {
    if (!this.maps.has(name)) {
      this.maps.set(name, new MockYMap<V>());
    }
    return this.maps.get(name) as MockYMap<V>;
  }

  onUpdate(cb: UpdateCallback): () => void {
    this.updateCallbacks.add(cb);
    return () => this.updateCallbacks.delete(cb);
  }

  applyUpdate(update: unknown): void {
    this.updateCallbacks.forEach((cb) => cb(update));
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.stateCallbacks.forEach((cb) => cb());
  }

  onStateChange(cb: StateCallback): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class YjsProvider {
  private doc: MockYDoc;
  private roomId: string;
  private connected = false;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.doc = new MockYDoc(roomId);
  }

  connect(): void {
    this.doc.setConnectionState('connecting');
    // Simulate connection delay.
    setTimeout(() => {
      this.connected = true;
      this.doc.setConnectionState('connected');
    }, 100);
  }

  disconnect(): void {
    this.connected = false;
    this.doc.setConnectionState('disconnected');
  }

  getConnectionState(): ConnectionState {
    return this.doc.getConnectionState();
  }

  getDoc(): MockYDoc {
    return this.doc;
  }

  getRoomId(): string {
    return this.roomId;
  }
}
