import {describe, it, expect, vi, beforeEach} from 'vitest';
import {PubSub, EditorEventMap} from './eventBus';

describe('PubSub', ()=>{
  let bus: PubSub;

  beforeEach(()=>{
    bus = new PubSub();
  });

  it('should subscribe and publish events', ()=>{
    const handler = vi.fn();
    bus.subscribe('local:tool:activated', handler);

    bus.publish('local:tool:activated', {toolName: 'brush'});

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({toolName: 'brush'});
  });

  it('should unsubscribe handlers', ()=>{
    const handler = vi.fn();
    const unsub = bus.subscribe('local:tool:activated', handler);

    unsub(); // unsubscribe
    bus.publish('local:tool:activated', {toolName: 'eraser'});

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle multiple handlers for the same event', ()=>{
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.subscribe('local:palette:changed', handler1);
    bus.subscribe('local:palette:changed', handler2);

    bus.publish('local:palette:changed', {colors: [1, 2, 3]});

    expect(handler1).toHaveBeenCalledWith({colors: [1, 2, 3]});
    expect(handler2).toHaveBeenCalledWith({colors: [1, 2, 3]});
  });

  it('should not call handlers for other events', ()=>{
    const handler = vi.fn();
    bus.subscribe('local:tool:activated', handler);

    bus.publish('local:file:loaded', {fileName: 'foo', data: new ArrayBuffer(8)});

    expect(handler).not.toHaveBeenCalled();
  });

  it('should clear all handlers', ()=>{
    const handler = vi.fn();
    bus.subscribe('local:tool:activated', handler);
    bus.clearAll();

    bus.publish('local:tool:activated', {toolName: 'bucket'});
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support system:error event', ()=>{
    const handler = vi.fn();
    bus.subscribe('system:error', handler);

    const errorPayload: EditorEventMap['system:error'] = {
      type: 'uncaught',
      message: 'Something went wrong',
      filename: 'main.ts',
      lineno: 10,
      colno: 5,
      error: new Error('fail'),
    };

    bus.publish('system:error', errorPayload);

    expect(handler).toHaveBeenCalledWith(errorPayload);
  });

  it('should support ui:modal:open with context', ()=>{
    const handler = vi.fn();
    bus.subscribe('ui:modal:open', handler);

    bus.publish('ui:modal:open', {modalId: 'help', context: {foo: 1}});
    expect(handler).toHaveBeenCalledWith({modalId: 'help', context: {foo: 1}});

    bus.publish('ui:modal:open', {modalId: 'about'});
    expect(handler).toHaveBeenCalledWith({modalId: 'about'});
  });
});
