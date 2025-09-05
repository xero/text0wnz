// keybinding logic (global and tool-specific)
export type KeyHandler = (e: KeyboardEvent) => void;

const keybindRegistry = new Map<string, KeyHandler>();
export function registerKeybind(context: string, handler: KeyHandler) {
  const removed = unregisterKeybind(context);
  if (removed || !keybindRegistry.has(context)) {
    keybindRegistry.set(context, handler);
    document.addEventListener('keydown', handler, {passive: false});
  }
}
export function unregisterKeybind(context: string): boolean {
  const handler = keybindRegistry.get(context);
  if (handler) {
    document.removeEventListener('keydown', handler);
    keybindRegistry.delete(context);
    return true;
  }
  return false;
}
export const KEYBIND_PALETTE = 'palette';
// palette picker keybinds registration
export function registerPaletteKeybinds(
  paletteObj: {
    getForegroundColor: () => number;
    getBackgroundColor: () => number;
    setForegroundColor: (n: number) => void;
    setBackgroundColor: (n: number) => void;
  },
  updateCurrentColorsPreview: () => void
) {
  const handler: KeyHandler = (e)=>{
    // Number keys 1-8: set foreground/background with Ctrl/Alt
    if (e.key >= '1' && e.key <= '8') {
      const num = parseInt(e.key, 10);
      if (e.ctrlKey) {
        e.preventDefault();
        if (paletteObj.getForegroundColor() === num) {
          paletteObj.setForegroundColor(num + 8);
        } else {
          paletteObj.setForegroundColor(num);
        }
      } else if (e.altKey) {
        e.preventDefault();
        if (paletteObj.getBackgroundColor() === num) {
          paletteObj.setBackgroundColor(num + 8);
        } else {
          paletteObj.setBackgroundColor(num);
        }
      }
    }
    // Ctrl + arrows: cycle colors
    else if (
      e.ctrlKey &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
    ) {
      e.preventDefault();
      switch (e.key) {
        case 'ArrowLeft': {
          let color = paletteObj.getBackgroundColor();
          color = color === 0 ? 15 : color - 1;
          paletteObj.setBackgroundColor(color);
          break;
        }
        case 'ArrowUp': {
          let color = paletteObj.getForegroundColor();
          color = color === 0 ? 15 : color - 1;
          paletteObj.setForegroundColor(color);
          break;
        }
        case 'ArrowRight': {
          let color = paletteObj.getBackgroundColor();
          color = color === 15 ? 0 : color + 1;
          paletteObj.setBackgroundColor(color);
          break;
        }
        case 'ArrowDown': {
          let color = paletteObj.getForegroundColor();
          color = color === 15 ? 0 : color + 1;
          paletteObj.setForegroundColor(color);
          break;
        }
      }
    }
    updateCurrentColorsPreview();
  };
  registerKeybind(KEYBIND_PALETTE, handler);
}

// nuke it all
export function unregisterAllKeybinds() {
  Array.from(keybindRegistry.keys()).forEach(unregisterKeybind);
}
