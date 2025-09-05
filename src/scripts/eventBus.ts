/**
 * Define all event types and their payloads here.
 * Extend with more namespaces/events as needed.
 */
import {FontRenderer} from './canvasRenderer';
import type {GlobalState} from './state';
export type EditorEventMap = {
  'local:tool:activated': { toolName: string };
  'local:file:loaded': { fileName: string; data: ArrayBuffer };
  'local:palette:changed': { colors: number[] };
  'local:canvas:cleared': { reason: 'user' | 'reset' | 'new-file' };
  'network:canvas:update': { patch: Uint8Array; userId: string };
  'network:user:joined': { userId: string; nickname: string };
  'network:chat:message': { userId: string; message: string };
  'ui:notification': { message: string; level: 'info' | 'warn' | 'error' };
  'ui:modal:open': { modalId: string; context?: unknown };
  'ui:state:changed': { state: GlobalState };
  'ui:canvas:resize': {
    width:number;
    height:number;
    font:FontRenderer;
    columns:number;
    rows:number;
    dpr:number;
  };
  'system:error': {
    type: 'uncaught' | 'unhandledrejection';
    message: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    error?: unknown;
  };
};
type EventKey = keyof EditorEventMap;
type Handler<K extends EventKey> = (payload: EditorEventMap[K])=>void;
export class PubSub {
  private handlers: Partial<{[K in EventKey]: Set<Handler<unknown>>}> = {};

  subscribe<K extends EventKey>(event: K, handler: Handler<K>):()=>void{
    if (!this.handlers[event]) {
      this.handlers[event] = new Set();
    }
    (this.handlers[event] as Set<Handler<K>>).add(handler);
    return ()=>{
      this.unsubscribe(event, handler);
    };
  }

  unsubscribe<K extends EventKey>(event: K, handler: Handler<K>) {
    (this.handlers[event] as Set<Handler<K>>).delete(handler);
  }

  publish<K extends EventKey>(event: K, payload: EditorEventMap[K]) {
    (this.handlers[event] as Set<Handler<K>> | undefined)?.forEach((handler)=>{
      handler(payload);
    });
  }

  clearAll() {
    Object.values(this.handlers).forEach((set)=>{
      set.clear();
    });
  }
}
export const eventBus = new PubSub();

/*
// ==========================
// 4. Usage Example
// ==========================

// In a tool module
import { eventBus } from "./eventBus";
eventBus.subscribe("local:file:loaded", ({ fileName, data }) => {
  // handle file
});
eventBus.publish("local:tool:activated", { toolName: "brush" });

// In network module
eventBus.publish("network:chat:message", { userId, message });
*/
