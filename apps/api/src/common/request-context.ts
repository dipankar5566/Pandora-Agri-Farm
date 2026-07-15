import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestCtx {
  requestId: string;
  userId?: string;
}

export const ctxStore = new AsyncLocalStorage<RequestCtx>();

export const ctx = (): RequestCtx | undefined => ctxStore.getStore();
