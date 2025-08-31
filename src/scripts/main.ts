import {createState} from './state';
import {eventBus} from './eventBus';
import {initUI} from './uiController';

const state = createState();
// --- Global Error Handling ---
window.addEventListener('error', (event)=>{
  eventBus.publish('system:error', {
    type: 'uncaught',
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: (event.error instanceof Error) ? event.error : new Error(String(event.error)),
  });
});

window.addEventListener('unhandledrejection', (event)=>{
  function hasMessage(obj: unknown): obj is { message: string } {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      Object.prototype.hasOwnProperty.call(obj, 'message') &&
      typeof (obj as { message: unknown }).message === 'string'
    );
  }

  let error: Error;
  let message: string;

  if (event.reason instanceof Error) {
    error = event.reason;
    message = event.reason.message;
  } else if (hasMessage(event.reason)) {
    error = new Error(event.reason.message);
    message = event.reason.message;
  } else {
    error = new Error(String(event.reason));
    message = String(event.reason);
  }

  eventBus.publish('system:error', {
    type: 'unhandledrejection',
    message,
    error,
  });
});

// Update global state and notify UI on critical errors:
eventBus.subscribe('system:error', (err)=>{
  console.error('Global Error:', err);
  state.error = err.message;
  eventBus.publish('ui:state:changed', {state});
  eventBus.publish('ui:notification', {
    message: 'An unexpected error occurred. Please reload or check the console.',
    level: 'error'
  });
});

// UI initialization
document.addEventListener('DOMContentLoaded', ()=>{
  void (async()=>{
    try {
      await initUI(state, eventBus);
    } catch (e) {
      eventBus.publish('system:error', {
        type: 'uncaught',
        message: e instanceof Error ? e.message : String(e),
        error: e,
      });
    }
  })();
});
/*
// 2. UI Shell/Menu
renderStartupMenu();
setupMenuListeners(eventBus); // e.g. eventBus.publish("menu:new-file")

// 3. Network Probe
probeServerAvailability().then(isUp => {
  eventBus.publish("network:status", { isUp });
  updateMenuUI(isUp);
});

// 4. (Optional) Settings, Theme, Analytics
darkmode();
*/
