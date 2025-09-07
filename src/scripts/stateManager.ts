import {createState, GlobalState, CanvasState} from './state';
import {eventBus} from './eventBus';

class StateManager {
  private state: GlobalState;

  constructor() {
    this.state = createState();
  }

  getState(): GlobalState {
    return this.state;
  }

  updateCanvas(newCanvas: CanvasState): void {
    if (this.state.currentRoom) {
      this.state.currentRoom.canvas = newCanvas;
      eventBus.publish('state:canvas:changed', {canvas: newCanvas});
    }
  }

  setInitialState(state: GlobalState): void {
    this.state = state;
  }
}

export const stateManager = new StateManager();
