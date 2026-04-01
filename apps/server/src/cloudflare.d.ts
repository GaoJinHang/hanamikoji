// Cloudflare Workers 类型声明

// Durable Object 相关类型
interface DurableObjectState {
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string, options?: DurableObjectGetOptions): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T, options?: DurableObjectPutOptions): Promise<void>;
  delete(key: string, options?: DurableObjectPutOptions): Promise<boolean>;
  list<T = unknown>(options?: DurableObjectListOptions): Promise<Map<string, T>>;
}

interface DurableObjectGetOptions {
  allowConcurrency?: boolean;
  noCache?: boolean;
}

interface DurableObjectPutOptions {
  allowConcurrency?: boolean;
  allowUnconfirmed?: boolean;
  noCache?: boolean;
}

interface DurableObjectListOptions {
  start?: string;
  startAfter?: string;
  end?: string;
  prefix?: string;
  reverse?: boolean;
  limit?: number;
  allowConcurrency?: boolean;
  noCache?: boolean;
}

interface DurableObjectNamespace {
  newUniqueId(opts?: DurableObjectNamespaceNewUniqueIdOptions): DurableObjectId;
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectNamespaceNewUniqueIdOptions {
  jurisdiction?: string;
}

interface DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
  readonly name?: string;
}

interface DurableObjectStub {
  readonly id: DurableObjectId;
  readonly name?: string;
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

// WebSocket 对类型
declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

// WebSocket 扩展方法
interface WebSocket {
  accept(): void;
}

// 环境变量类型
interface Env {
  GAME_ROOM: DurableObjectNamespace;
}