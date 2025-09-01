// top-level UI orchestrator: handles global UI events, tool switching,
// dialog logic, delegations to toolManager
import type {GlobalState} from './state';
import type {PubSub} from './eventBus';
import type {FontType} from './fontManager';
import {createDefaultUserState, createOfflineRoomState} from './state';
import {initCanvasRenderer} from './canvasRenderer';
import {setFont, FontRenderer} from './fontManager';
import {createDefaultPalette, Palette} from './paletteManager';
import {ToolManager} from './toolManager';
import {PenTool} from './tools/pen';

/* <--//-----------------------------------------------------------[helpers] */
const
  D = document,
  W = window,
  $ = (i: string)=>{ const e = D.getElementById(i); if (!e) throw new Error(`Element #${i} not found`); return e },
  /* eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters */
  $$ = <T extends Element = HTMLElement>(q: string): T=>{ const e = D.querySelector(q); if (!e) throw new Error(`Element ${q} was not found`); return e as T; },
  /* eslint-disable-next-line @typescript-eslint/no-deprecated */
  $$$ = D.querySelectorAll.bind(D),
  add = (t: HTMLElement, f: (ev: MouseEvent | KeyboardEvent) => void, k: number = 0)=>t.addEventListener(k ? 'keydown' : 'click', f as EventListener, false),
  has = (i: HTMLElement, c: string)=>i.classList.contains(c),
  cl = (i: HTMLElement, c: string, a:boolean = true)=>a ? i.classList.add(c) : i.classList.remove(c),
  t = (i: HTMLElement, c: string)=>i.classList.toggle(c),
  sm = ()=>W.innerWidth <= 640,
  to = setTimeout;

/* <--//------------------------------------------------[interface elements] */
let
  html:HTMLElement,
  modal:HTMLDialogElement,
  title:HTMLInputElement,
  resolution:HTMLElement,
  chat:HTMLElement,
  chatz:HTMLElement,
  chatLeave:HTMLElement,
  chatRoom:HTMLElement,
  chatResolution:HTMLElement,
  chatJoints:HTMLElement,
  chatNew:HTMLElement,
  jointCancel:HTMLElement,
  jointsCancel:HTMLElement,
  resCancel:HTMLElement,
  joint:HTMLElement,
  offline:HTMLElement,
  open:HTMLElement,
  keeb:HTMLElement,
  brush:HTMLElement,
  bucket:HTMLElement,
  select:HTMLElement,
  shapes:HTMLElement,
  dropper:HTMLElement,
  font:HTMLElement,
  switchFont:HTMLElement,
  fontLabel:HTMLElement,
  collab:HTMLElement,
  grid:HTMLElement,
  mirror:HTMLElement,
  circles:HTMLElement,
  fliph:HTMLElement,
  flipv:HTMLElement,
  move:HTMLElement,
  clipboard:HTMLElement,
  zoom:HTMLElement,
  characterBrush:HTMLElement,
  charmap:HTMLCanvasElement,
  ice:HTMLElement,
  spacing:HTMLElement,
  splashOpen:HTMLElement,
  splashJoint:HTMLElement,
  splashDraw:HTMLElement,
  fileOpen:HTMLElement,
  fileUpload:HTMLInputElement,
  fileJoint:HTMLElement,
  fontSelect:HTMLSelectElement,
  fontPreview:HTMLImageElement,
  curColors:HTMLCanvasElement,
  palettePrev:HTMLCanvasElement,
  art:HTMLCanvasElement,
  palette: Palette;

const getElements = ():void=>{
  html = $$('html');
  modal = $$<HTMLDialogElement>('#msg');
  title = $$<HTMLInputElement>('#title');
  resolution = $('resolution');
  chat = $('chat');
  chatz = $('chatz');
  chatLeave = $('chatLeave');
  chatRoom = $('chatRoom');
  chatResolution = $('chatResolution');
  chatJoints = $('chatJoints');
  chatNew = $('chatNew');
  jointCancel = $('jointCancel');
  jointsCancel = $('jointsCancel');
  resCancel = $('resCancel');
  joint = $('joint');
  offline = $('offline');
  open = $('open');
  keeb = $('keeb');
  brush = $('brush');
  bucket = $('bucket');
  select = $('select');
  shapes = $('shapes');
  dropper = $('dropper');
  font = $('font');
  switchFont = $('switchFont');
  fontLabel = $$('#font strong');
  collab = $('collab');
  grid = $('grid');
  mirror = $('mirror');
  circles = $('circles');
  fliph = $('fliph');
  flipv = $('flipv');
  move = $('move');
  clipboard = $('clipboard');
  zoom = $('zoom');
  characterBrush = $('characterBrush');
  charmap = $$<HTMLCanvasElement>('#charmap');
  ice = $('ice');
  spacing = $('spacing');
  splashOpen = $('splashOpen');
  splashJoint = $('splashJoint');
  splashDraw = $('splashDraw');
  fileOpen = $('fileOpen');
  fileJoint = $('fileJoint');
  fileUpload = $$<HTMLInputElement>('#fileUpload');
  fontSelect = $$<HTMLSelectElement>('#fontName');
  fontPreview = $$<HTMLImageElement>('#fontPreview');
  curColors = $$<HTMLCanvasElement>('#currentColors');
  palettePrev = $$<HTMLCanvasElement>('#paletteColors');
  art = $$<HTMLCanvasElement>('#art');

/* @TODO: remove linter fix */
void sm;
void joint;
void offline;
void collab;
void grid;
void circles;
void fliph;
void flipv;
void move;
void charmap;
void ice;
void spacing;
void art;
}

/* <--//----------------------------------------------------------[internal] */

const initCanvas = (canvas:HTMLCanvasElement, name:string):CanvasRenderingContext2D=>{
  const ctx = canvas.getContext('2d',{willReadFrequently: true});
  if (!ctx) throw new Error(`Canvas '${name}' not found`);
  // ensure canvas drawing buffer matches its rendered size
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  return ctx;
}

//---modal
const modalIsOpen = ():boolean=>modal.open;
const modalShow = (section:string)=>{
  modalClear();
  cl($(section), 'hide', false);
  void (!modalIsOpen() && modal.showModal());
};
const modalClose = ()=>{
  cl(modal, 'closing');
  to(()=>{
    modal.classList.remove('closing');
    modal.close();
  }, 700);
}
const modals = [
  $('splash'),
  $('collab'),
  $('fonts'),
  $('file'),
  $('error'),
];
const modalClear = ()=>modals.forEach(s=>cl(s, 'hide'));
const showError = (message:string)=>{
  $('modalError').innerHTML = message;
  modalShow('error');
};

//---chat
const clouds = [
  $('jointCloud'),
  $('offlineCloud'),
  $('stormCloud'),
  $('theCloud'),
  $('snowCloud'),
  $('storageCloud'),
];
const cloudHide = ():void=>clouds.forEach(i=>cl(i,'hide',true));
const cloudShow = (cloud:string):void=>{
  cloudHide();
  cl($(`${cloud}Cloud`), 'hide', false);
};
const navChat = (screen:string)=>{
  [chatResolution,chatJoints,chatRoom,chatNew].forEach(s=>cl(s,'hide',true));
  cl($(`chat${screen.charAt(0).toUpperCase()}${screen.slice(1).toLowerCase()}`),'hide',false);
  cl(screen === 'resolution' ? resolution : chat, 'selected', true);
  cl(chatz,'hide',false);
};
const toggleChatRes = (w:string):void=>{
  const
  c:boolean = has(chat,'selected'),
  r:boolean = has(resolution, 'selected');
  [chat, resolution].forEach(s=>cl(s,'selected',false));
  if(
    (w === 'chat' && r) || (w === 'resolution' && c) ||
      ((w === 'chat' || w === 'resolution') && (!r && !c))
  ){
    if(w === 'chat'){
      cl(chat,'selected',true);
      navChat('room');
    }else{
      cl(resolution,'selected',true);
      navChat('resolution');
    }
  }else{
    cl(chatz,'hide',true);
  }
};

//---tool options
const tools = [
  $('keebOpts'),
  $('brushOpts'),
  $('fillOpts'),
  $('shapeOpts'),
  $('selectOpts'),
  $('clipOpts'),
  $('zoomOpts'),
  $('charOpts'),
];
const toolOpsHide = ()=>tools.forEach(o=>cl(o,'hide',true));

const toolOps = (tool:string, subtool:boolean = false)=>{
  if(!subtool) toolOpsHide();
  cl($(`${tool}Opts`), 'hide', false);
};

const updateCurrentColorsPreview = ()=>{
  const ctx = initCanvas(curColors, 'current colors');
  const size = Math.min(curColors.width, curColors.height);
  const swatch = Math.round(size * 0.6);
  const offset = size - swatch;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = `rgba(${palette.getRGBAColor(palette.getBackgroundColor()).join(',')})`;
  ctx.fillRect(offset, offset, swatch, swatch);
  ctx.fillStyle = `rgba(${palette.getRGBAColor(palette.getForegroundColor()).join(',')})`;
  ctx.fillRect(0, 0, swatch, swatch);
}
interface PalettePicker {
  updatePalette: () => void;
}

const createPalettePicker = (canvas: HTMLCanvasElement, paletteObj: Palette): PalettePicker=>{
  const
    ctx = initCanvas(canvas, 'paletteColors'),
    imageData: ImageData[] = [],
    cols = 8, rows = 2,
    swatchWidth = canvas.width / cols,
    swatchHeight = canvas.height / rows;

  function updateColor(index: number): void {
    const color = paletteObj.getRGBAColor(index);
    if (!imageData[index]) return;
    for (let y = 0, i = 0; y < imageData[index].height; y++) {
      for (let x = 0; x < imageData[index].width; x++, i += 4) {
        imageData[index].data.set(color, i);
      }
    }
    const
    col = index % cols,
    row = Math.floor(index / cols);
    ctx.putImageData(
      imageData[index],
      col * swatchWidth,
      row * swatchHeight
    );
  }

  function updatePalette(): void {
    for (let i = 0; i < 16; i++){
      updateColor(i);
    }
    updateCurrentColorsPreview();
  }

  function touchEnd(evt: TouchEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((evt.changedTouches[0].pageX - rect.left) / swatchWidth);
    const y = Math.floor((evt.changedTouches[0].pageY - rect.top) / swatchHeight);
    const colorIndex = y * cols + x;
    paletteObj.setForegroundColor(colorIndex);
    updateCurrentColorsPreview();
  }
  function mouseEnd(evt: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((evt.clientX - rect.left) / swatchWidth);
    const y = Math.floor((evt.clientY - rect.top) / swatchHeight);
    const colorIndex = y * cols + x;
    if (!evt.altKey && !evt.ctrlKey) {
      paletteObj.setForegroundColor(colorIndex);
    } else {
      paletteObj.setBackgroundColor(colorIndex);
    }
    updateCurrentColorsPreview();
  }

  function keydown(evt: KeyboardEvent) {
    if (evt.key >= '1' && evt.key <= '8') {
      const num = parseInt(evt.key, 10);
      if (evt.ctrlKey) {
        evt.preventDefault();
        if (paletteObj.getForegroundColor() === num) {
          paletteObj.setForegroundColor(num + 8);
        } else {
          paletteObj.setForegroundColor(num);
        }
      } else if (evt.altKey) {
        evt.preventDefault();
        if (paletteObj.getBackgroundColor() === num) {
          paletteObj.setBackgroundColor(num + 8);
        } else {
          paletteObj.setBackgroundColor(num);
        }
      }
    }
    // Handle arrow keys with Ctrl
    else if (evt.ctrlKey && (
      evt.key === 'ArrowLeft' ||
        evt.key === 'ArrowUp' ||
        evt.key === 'ArrowRight' ||
        evt.key === 'ArrowDown'
    )) {
      evt.preventDefault();
      switch (evt.key) {
        case 'ArrowLeft': {
          let color = paletteObj.getBackgroundColor();
          color = (color === 0) ? 15 : (color - 1);
          paletteObj.setBackgroundColor(color);
          break;
        }
        case 'ArrowUp': {
          let color = paletteObj.getForegroundColor();
          color = (color === 0) ? 15 : (color - 1);
          paletteObj.setForegroundColor(color);
          break;
        }
        case 'ArrowRight': {
          let color = paletteObj.getBackgroundColor();
          color = (color === 15) ? 0 : (color + 1);
          paletteObj.setBackgroundColor(color);
          break;
        }
        case 'ArrowDown': {
          let color = paletteObj.getForegroundColor();
          color = (color === 15) ? 0 : (color + 1);
          paletteObj.setForegroundColor(color);
          break;
        }
        default:
          break;
      }
    }
    updateCurrentColorsPreview();
  }

  for (let i = 0; i < 16; i++) {
    imageData[i] = ctx.createImageData(swatchWidth + 1, swatchHeight);
  }
  updatePalette();
  canvas.addEventListener('touchend', touchEnd);
  canvas.addEventListener('touchcancel', touchEnd);
  canvas.addEventListener('mouseup', mouseEnd);
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
  document.addEventListener('keydown', keydown);

  return {
    updatePalette
  }
}

function setupFKeyCanvases(fontCellHeight: number, maxVisualHeight: number = 45): void {
  const fontCellWidth = 8;
  const scale = maxVisualHeight / fontCellHeight;
  const visualWidth = Math.round(fontCellWidth * scale);
  const visualHeight = Math.round(fontCellHeight * scale);

  for (let i = 1; i < 13; i++) {
    const canvas = $$<HTMLCanvasElement>(`#fkey${i}`);
    canvas.width = fontCellWidth;
    canvas.height = fontCellHeight;
    canvas.style.width = `${visualWidth}px`;
    canvas.style.height = `${visualHeight}px`;
    const ctx = initCanvas(canvas, `#fkey${i}`);
    /* @TODO: draw real char from font */
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function getPointerXY(ev: PointerEvent, font: FontRenderer) {
  const rect = art.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) / font.width);
  const y = Math.floor((ev.clientY - rect.top) / (font.height / 2));
  return {x, y};
}

//
/* <--//----------------------------------------------------------[external] */
export async function initUI(state:GlobalState, eventBus:PubSub) {
  void state;

  // listen for state changes (only error changes, for now)
  eventBus.subscribe('ui:state:changed', ({state})=>{
    if (state.error) showError(state.error)
  });
  // global error handler
  add($('restart'),_=>W.location.reload());
  getElements();

  //--------------- dark mode
  if (W.matchMedia('(prefers-color-scheme: dark)').matches) {
    html.classList.add('dark');
  }

  //--------------- menus
  add($('darkmode'),_=>t(html, 'dark'));
  [resolution,resCancel].forEach(r=>add(r,_=>toggleChatRes('resolution')));
  add($('jointNew'),_=>navChat('new'));

  //--------------- file config
  [fileOpen,splashOpen].forEach(
    b=>add(b,_=>fileUpload.click())
  );
  fileUpload.addEventListener('change', _=>{
    alert(`got it`);
  });
  add(fileJoint,_=>navChat('joints'));
  add(open,_=>modalShow('file'));
  title.value = 'untitled';

  //--------------- chatz
  cloudShow('offline');
  add(chat,_=>toggleChatRes('chat'));
  add(chatLeave,_=>navChat('joints'));
  /* @TODO: check if in a joint already before defaulting to chat */
  add(jointCancel,_=>navChat('joints'));
  add(jointsCancel,_=>navChat('room'));

  //--------------- canvas
  palette = createDefaultPalette();
  const fontRenderer: FontRenderer = await setFont('TOPAZ_437', 'cp437', palette, false);
  const canvasRenderer = initCanvasRenderer(state, palette, fontRenderer);

  //--------------- tools

  // keeb
  /* @TODO: GET FROM REAL FONT */
  // setupFKeyCanvases(currentFont.height);
  setupFKeyCanvases(16, 32);

  // menu
  add(keeb, _=>toolOps('keeb'));
  add(brush, _=>toolOps('brush'));
  add(bucket, _=>toolOps('fill'));
  add(shapes, _=>toolOps('shape'));
  add(select, _=>toolOps('select'));
  add(clipboard, _=>toolOps('clip'));
  add(zoom, _=>toolOps('zoom'));
  add(dropper, _=>toolOpsHide());
  add(mirror, _=>toolOpsHide());
  toolOpsHide();
  // brushes
  add(characterBrush, _=>toolOps('char',true));

  const toolContext = {
    state,
    palette,
    font: fontRenderer,
  };
  const toolManager = new ToolManager(toolContext);
  toolManager.registerTool(new PenTool());
  add($('blockBrush'),_=>toolManager.setActiveTool('pen'));
  ['pointerdown', 'pointermove', 'pointerup', 'pointerleave'].forEach(type=>{
    art.addEventListener(type, (ev: Event)=>{
      if (!(ev instanceof PointerEvent)) return;
      const {x, y} = getPointerXY(ev, fontRenderer);
      const common = {
        x,
        y,
        button: ev.button,
        shiftKey: ev.shiftKey,
        ctrlKey: ev.ctrlKey,
        altKey: ev.altKey,
        metaKey: ev.metaKey,
      };
      switch (type) {
        case 'pointerdown': toolManager.handlePointerDown(common); break;
        case 'pointermove': toolManager.handlePointerMove(common); break;
        case 'pointerup': toolManager.handlePointerUp(common); break;
        case 'pointerleave': toolManager.handlePointerLeave(common); break;
      }
    });
  });

  //--------------- colors
  updateCurrentColorsPreview();
  curColors.addEventListener('click', ()=>{
    const fg = palette.getForegroundColor();
    palette.setForegroundColor(palette.getBackgroundColor());
    palette.setBackgroundColor(fg);
    updateCurrentColorsPreview();
  });
  const palettePicker = createPalettePicker(palettePrev, palette);
  // Listen for palette changes and update picker
  document.addEventListener('onPaletteChange', ()=>{
    palettePicker.updatePalette();
    canvasRenderer.setPalette(palette);
  });
  document.dispatchEvent(new CustomEvent('onPaletteChange'));

  //--------------- font config
  fontSelect.addEventListener('change',e=>{
    const name = (e.target as HTMLSelectElement).value;
    $('fontMeta').innerText = name;
    fontPreview.onload = ()=>{
      fontPreview.style.width  = `${String(fontPreview.naturalWidth * 1.5)}px`;
      fontPreview.style.height = `${String(fontPreview.naturalHeight * 1.5)}px`;
      fontPreview.onload = null;
    };
    fontPreview.src = `/ui/fontz/${name}.png`;
  });

  add(switchFont, _=>{
    void (async()=>{
      let fontRenderer: FontRenderer | null = null;
      const fontName = fontSelect.value;
      try {
        // Determine font type
        let fontType: FontType = 'cp437';
        if (fontName === 'utf8-system') fontType = 'utf8';
          else if (fontName === 'XBIN') fontType = 'cp437'; // XBIN is still cp437 style

        /*
    if (fontName === 'XBIN') {
      // Get XBIN font data from state or wherever you store it
      const xb = state.currentRoom?.canvas.xbFontData;
      if (!xb) throw new Error('No XBIN font data loaded');
      fontRenderer = await loadFontFromXBData(
        xb.bytes, xb.width, xb.height, false, palette, fontType
      );
    } else {
      fontRenderer = await setFont(fontName, fontType, palette, false);
    }
    */
        fontRenderer = await setFont(fontName, fontType, palette, false);

        canvasRenderer.setFont(fontRenderer);
        // Update state so UI and serialization knows the current font
        fontLabel.innerText = fontName;
        eventBus.publish('ui:state:changed', {state});
        modalClose();
        if (!state.currentRoom) return;
        state.currentRoom.canvas.font = fontName;
        state.currentRoom.canvas.fontType = fontType;
      } catch {
        showError(`Failed to load font: ${fontName}`);
      }
    })();
  });
  add(font,_=>modalShow('fonts'));

  //--------------- modal
  $$$<HTMLButtonElement>('.cancel').forEach(
    c=>add(c,_=>modalClose()));
  add(modal, e=>{if(e.target === modal) modalClose()});
  add(splashJoint,_=>navChat('joints'));
  add(splashDraw, _ => {
    state.user = {
      id: 'offline-user',
      nickname: 'offline',
      roomId: 0,
    };
    state.currentRoom = createOfflineRoomState(state.user);
  });
  //--------------- show app landing screen
  modalShow('splash');


  // listen for other notifications
  /*
  eventBus.subscribe('ui:notification', ({ message, level }) => {
    showToast(message, level);
  });
  $$$<HTMLDialogElement>('modal').forEach(m => m.close());
  to(()=>sm() ? 750 : 1);
  */
}
