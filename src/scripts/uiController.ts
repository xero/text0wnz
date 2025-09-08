// top-level UI orchestrator: handles global UI events, tool switching,
// dialog logic, delegations to toolManager
import type {GlobalState, SauceMetadata} from './state';
import type {PubSub} from './eventBus';
import type {FontType} from './fontManager';
import {createOfflineRoomState, createOfflineCanvasState} from './state';
import {forceFullRedraw, initCanvasRenderer, resetCanvasRenderer, resizeCanvasToState, toggleIceColors} from './canvasRenderer';
import {setFont, FontRenderer} from './fontManager';
import {PalettePicker, createDefaultPalette, Palette} from './paletteManager';
import {GridOverlay} from './gridOverlay';
import {ToolManager} from './toolManager';
import {PenTool} from './tools/pen';
import {ShadeBrushTool} from './tools/shade';

/* <--//-----------------------------------------------------------[helpers] */
const
  D = document,
  W = window,
  to = setTimeout,
  $ = (i: string)=>{ const e = D.getElementById(i); if (!e) throw new Error(`Element #${i} not found`); return e },
  /* eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters */
  $$ = <T extends Element = HTMLElement>(q: string): T=>{ const e = D.querySelector(q); if (!e) throw new Error(`Element ${q} was not found`); return e as T; },
  /* eslint-disable-next-line @typescript-eslint/no-deprecated */
  $$$ = D.querySelectorAll.bind(D),
  has = (i: HTMLElement, c: string)=>i.classList.contains(c),
  cl = (i: HTMLElement, c: string, a:boolean = true)=>a ? i.classList.add(c) : i.classList.remove(c),
  t = (i: HTMLElement, c: string)=>i.classList.toggle(c),
  sm = ()=>W.innerWidth <= 640,
  add = (
    t: HTMLElement,
    f: (e: MouseEvent | KeyboardEvent) => void | Promise<void>,
    k: number = 0
  )=>t.addEventListener(k ? 'keydown' : 'click', (e: Event)=>{
    let result: Promise<void> | undefined;
    if (k && e instanceof KeyboardEvent) {
      const r = f(e);
      if (r instanceof Promise) result = r;
    } else if (!k && e instanceof MouseEvent) {
      const r = f(e);
      if (r instanceof Promise) result = r;
    }
    if (result) { result.catch(()=>{ throw new Error('Async event handler failed')})}
  },false);

/* <--//------------------------------------------------[interface elements] */
let
  state:GlobalState,
  html:HTMLElement,
  fontRenderer: FontRenderer,
  modal:HTMLDialogElement,
  modals: HTMLElement[],
  clouds: HTMLElement[],
  tools: HTMLElement[],
  navTitle:HTMLInputElement,
  resolution:HTMLElement,
  lblRes:HTMLElement,
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
  fileDraw:HTMLElement,
  fontSelect:HTMLSelectElement,
  fontPreview:HTMLImageElement,
  resSave:HTMLElement,
  txtCols:HTMLInputElement,
  txtRows:HTMLInputElement,
  sauceTitle:HTMLInputElement,
  sauceAuthor:HTMLInputElement,
  sauceGroup:HTMLInputElement,
  sauceComments: HTMLTextAreaElement,
  sauceBytes: HTMLInputElement,
  sauceSave: HTMLElement,
  cursorPos:HTMLElement,
  curColors:HTMLCanvasElement,
  palettePrev:HTMLCanvasElement,
  art:HTMLCanvasElement,
  palette: Palette;

const getElements = ():void=>{
  html = $$('html');
  modal = $$<HTMLDialogElement>('#msg');
  navTitle = $$<HTMLInputElement>('#title');
  resolution = $('resolution');
  lblRes = $$('#resolution kbd');
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
  fileDraw = $('fileDraw');
  fileUpload = $$<HTMLInputElement>('#fileUpload');
  fontSelect = $$<HTMLSelectElement>('#fontName');
  fontPreview = $$<HTMLImageElement>('#fontPreview');
  resSave = $('resSave');
  cursorPos = $('cursorPos');
  sauceTitle = $$<HTMLInputElement>('#sauceTitle');
  sauceAuthor = $$<HTMLInputElement>('#sauceAuthor');
  sauceGroup = $$<HTMLInputElement>('#sauceGroup');
  sauceComments = $$<HTMLTextAreaElement>('#sauceComments');
  sauceBytes = $$<HTMLInputElement>('#sauceBytes');
  sauceSave = $('sauceSave');
  curColors = $$<HTMLCanvasElement>('#currentColors');
  txtCols = $$<HTMLInputElement>('#txtCols');
  txtRows = $$<HTMLInputElement>('#txtRows');
  palettePrev = $$<HTMLCanvasElement>('#paletteColors');
  art = $$<HTMLCanvasElement>('#art');

  modals = [
    $('splash'),
    $('collab'),
    $('fonts'),
    $('file'),
    $('sauce'),
    $('error'),
  ];

  clouds = [
    $('jointCloud'),
    $('offlineCloud'),
    $('stormCloud'),
    $('theCloud'),
    $('snowCloud'),
    $('storageCloud'),
  ];
  tools = [
    $('keebOpts'),
    $('brushOpts'),
    $('fillOpts'),
    $('shapeOpts'),
    $('selectOpts'),
    $('clipOpts'),
    $('zoomOpts'),
    $('charOpts'),
  ];

  /* @TODO: remove linter fix */
  void sm;
  void joint;
  void collab;
  void offline;
  void circles;
  void fliph;
  void flipv;
  void move;
  void charmap;
  void ice;
}

/* <--//----------------------------------------------------------[internal] */

const initCanvas = (canvas:HTMLCanvasElement, name:string):CanvasRenderingContext2D=>{
  const ctx = canvas.getContext('2d',{willReadFrequently: true});
  if (!ctx) throw new Error(`Canvas '${name}' not found`);
  const desiredWidth = canvas.clientWidth;
  const desiredHeight = canvas.clientHeight;
  if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
    canvas.width = desiredWidth;
    canvas.height = desiredHeight;
  }
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
const modalClear = ()=>modals.forEach(s=>cl(s, 'hide'));
const showError = (message:string)=>{
  $('modalError').innerHTML = message;
  modalShow('error');
};

//---chat
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

  //reset resolution form
  if(!state.currentRoom) return;
  const canvas = state.currentRoom.canvas;
  txtRows.value = canvas.height.toString();
  txtCols.value = canvas.width.toString();
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
function getPointerXY(e: PointerEvent, state: GlobalState, halfBlock = false) {
  const c = state.currentRoom?.canvas;
  if(!c) return;
  const rect = art.getBoundingClientRect();

  // Calculate cell width/height in CSS pixels
  const cellWidth = rect.width / c.width;
  const cellHeight = rect.height / c.height;

  let x = Math.floor((e.clientX - rect.left) / cellWidth);
  let y;
  if (halfBlock) {
    y = Math.floor((e.clientY - rect.top) / (cellHeight / 2));
    y = Math.max(0, Math.min(y, c.height * 2 - 1));
  } else {
    y = Math.floor((e.clientY - rect.top) / cellHeight);
    y = Math.max(0, Math.min(y, c.height - 1));
  }
  x = Math.max(0, Math.min(x, c.width - 1));
  return {x, y};
}

export function setCursorPos(x :number, y :number){
  cursorPos.innerHTML = `${x},${y}`;
}

const SAUCE_MAX_BYTES = 16320;
function getUtf8Bytes(str: string): number {
  return new TextEncoder().encode(str).length;
}
function enforceMaxBytes() {
  let val = sauceComments.value;
  let bytes = getUtf8Bytes(val);
  while (bytes > SAUCE_MAX_BYTES) {
    // Remove last character until under max bytes
    val = val.slice(0, -1);
    bytes = getUtf8Bytes(val);
  }
  if (val !== sauceComments.value) {
    sauceComments.value = val;
  }
  sauceBytes.value = `${bytes}/${SAUCE_MAX_BYTES} bytes`;
}

function updateSauce() {
  if (!state.currentRoom) return;
  const title = sauceTitle.value.trim();
  const author = sauceAuthor.value.trim();
  const group = sauceGroup.value.trim();
  let comments = sauceComments.value;
  while (getUtf8Bytes(comments) > SAUCE_MAX_BYTES) {
    comments = comments.slice(0, -1);
  }
  navTitle.value = title;
  state.currentRoom.canvas.sauce = {
    title,
    author,
    group,
    comments
  };
}

function displayRes(cols:number, rows:number) {
  lblRes.innerText = `${cols} cols x ${rows} rows`;
}

function sauceDefaults() {
  navTitle.value = sauceTitle.value = 'untitled';
  sauceAuthor.value = 'anonymous';
  sauceGroup.value = sauceComments.value = '';
}

//
/* <--//----------------------------------------------------------[external] */
export function initUI(state: GlobalState, eventBus: PubSub) {
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
  toolOpsHide();

  //--------------- menus
  add($('darkmode'),_=>{t(html, 'dark')});
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

  //--------------- chatz
  cloudShow('offline');
  add(chat,_=>toggleChatRes('chat'));
  add(chatLeave,_=>navChat('joints'));
  /* @TODO: check if in a joint already before defaulting to chat */
  add(jointCancel,_=>navChat('joints'));
  add(jointsCancel,_=>navChat('room'));

  //--------------- welcome modal
  modalShow('splash');
  add(splashJoint,_=>navChat('joints'));
  add(splashDraw,_=>{
    state.user = {
      id: 'offline-user',
      nickname: 'offline',
      roomId: 0,
    };
    state.currentRoom = createOfflineRoomState(state.user);
    createOfflineCanvasState();
    setupCanvasAndTools(state, eventBus).then(()=>{
      modalClose();
    }).catch(()=>{
        throw new Error('Failed to initialize the interface');
    });
  });
}
async function setupCanvasAndTools(theState: GlobalState, eventBus: PubSub) {
  state = theState;
  //--------------- canvas
  palette = createDefaultPalette();
  const defaultFont = 'Topaz437 8x16';
  fontRenderer = await setFont(defaultFont, 'cp437', palette, false);
  fontSelect.value = defaultFont;
  fontPreview.src = `./ui/fontz/${defaultFont}.png`;
  fontPreview.style = 'width: 192px; height: 384px';
  const canvasRenderer = initCanvasRenderer(state, palette, fontRenderer);
  initCanvas(art, 'Art Drawing Canvas');
  sauceDefaults();

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

  // ICE colors toggle
  add(ice, _=>{
    if (!state.currentRoom) return;
    const canvas = state.currentRoom.canvas;
    canvas.ice = !canvas.ice;
    toggleIceColors();
    cl(ice, 'active', canvas.ice);
    console.log('click');
  });

  // brushes
  add(characterBrush, _=>toolOps('char',true));

  const toolContext = {
    state,
    palette,
    font: fontRenderer,
  };
  const toolManager = new ToolManager(toolContext);
  toolManager.registerTool(new PenTool());
  toolManager.registerTool(new ShadeBrushTool());
  add($('blockBrush'),_=>toolManager.setActiveTool('pen'));
  add($('shadeBrush'),_=>toolManager.setActiveTool('shade'));

  //tool listeners
  ['pointerdown', 'pointermove', 'pointerup', 'pointerleave'].forEach(type=>{
    art.addEventListener(type, (e: Event)=>{
      if (!(e instanceof PointerEvent)) return;
      e.preventDefault();
      const halfBlock = toolManager.getActiveTool()?.id === 'pen';
      const pointer = getPointerXY(e, state, halfBlock);
      if (!pointer) return;
      const {x, y} = pointer;
      const common = {
        x,
        y,
        button: e.button,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      };
      switch (type) {
        case 'pointerdown': toolManager.handlePointerDown(common); break;
        case 'pointermove': toolManager.handlePointerMove(common); break;
        case 'pointerup': toolManager.handlePointerUp(common); break;
        case 'pointerleave': toolManager.handlePointerLeave(common); break;
      }
    }, {passive: false});
  });

  //--------------- colors
  updateCurrentColorsPreview();
  curColors.addEventListener('click', ()=>{
    const fg = palette.getForegroundColor();
    palette.setForegroundColor(palette.getBackgroundColor());
    palette.setBackgroundColor(fg);
    updateCurrentColorsPreview();
  });
  const palettePicker = new PalettePicker({
    canvas: palettePrev,
    palette: palette,
    initCanvas,
    updateCurrentColorsPreview
  });
  // Listen for palette changes and update picker
  document.addEventListener('onPaletteChange', ()=>{
    palettePicker.updatePalette();
    canvasRenderer.setPalette(palette);
  });
  document.dispatchEvent(new CustomEvent('onPaletteChange'));

  //--------------- grid
  const artContainer = $('canvasArea');
  const gridOverlay = new GridOverlay(
    artContainer,
    fontRenderer,
    ()=>state.currentRoom?.canvas.width ?? 80,
    ()=>state.currentRoom?.canvas.height ?? 25
  );
  initCanvas($$<HTMLCanvasElement>('#grid-overlay'),'Grid Overlay');
  gridOverlay.show(false);
  add(grid,_=>gridOverlay.show(!gridOverlay.isShown()));

  //--------------- font config
  fontSelect.addEventListener('change', e=>{
    const name = (e.target as HTMLSelectElement).value;
    $('fontMeta').innerText = name;
    fontPreview.onload = ()=>{
      fontPreview.style.width  = `${String(fontPreview.naturalWidth * 1.5)}px`;
      fontPreview.style.height = `${String(fontPreview.naturalHeight * 1.5)}px`;
      fontPreview.onload = null;
    };
    fontPreview.src = `./ui/fontz/${name}.png`;
    if (fontPreview.complete) {
      fontPreview.onload(new Event('load'));
    }
  });

  add(switchFont, _=>{
    void (async()=>{
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

        canvasRenderer.setFont(fontRenderer); // This resizes and redraws the main canvas
        gridOverlay.setFont(fontRenderer);    // This updates the overlay to match
        toolManager.setFont(fontRenderer);    // This update the tools to match
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

  //-------------- 9pt font toggle
  add(spacing,_=>{
    if (!state.currentRoom) return;
    const c = state.currentRoom.canvas;
    // flip current font spacing value
    const spacing = !c.spacing;
    fontRenderer.setLetterSpacing(spacing);
    c.spacing = spacing ? 1 : 0;
    resizeCanvasToState();
    forceFullRedraw();
  });


  //-------------- resize canvas
  add(resSave,_=>{
    const cols = Number(txtCols.value);
    const rows = Number(txtRows.value);
    if (rows < 1 || cols < 1) throw new Error('Invalid canvas size');
    if(!state.currentRoom) throw new Error('Missing room context');
    const canvas = state.currentRoom.canvas;
    const newRawData = new Uint8Array(cols * rows * 3);
    const minCols = Math.min(cols, canvas.width);
    const minRows = Math.min(rows, canvas.height);
    for (let y = 0; y < minRows; ++y) {
      const oldRowStart = (y * canvas.width) * 3;
      const newRowStart = (y * cols) * 3;
      newRawData.set(
        canvas.rawdata.subarray(oldRowStart, oldRowStart + minCols * 3),
        newRowStart
      );
    }
    const newCanvas = {
      ...canvas,
      width: cols,
      height: rows,
      rawdata: newRawData,
      updatedAt: new Date().toISOString(),
    };
    state.currentRoom.canvas = newCanvas;
    eventBus.publish('ui:state:changed', {state});
    displayRes(cols, rows);
    toggleChatRes('');
  });
  add(navTitle,_=>{modalShow('sauce')});
  sauceComments.addEventListener('input', enforceMaxBytes);
  add(sauceSave,_=>{
    updateSauce();
    modalClose();
  });

  //--------------- file opts
  add(fileDraw, async _=>{
    fontRenderer = await setFont(defaultFont, 'cp437', palette, false);
    state.currentRoom = createOfflineRoomState(state.user);
    state.currentRoom.canvas = createOfflineCanvasState();
    resetCanvasRenderer(state, palette, fontRenderer);
    displayRes(80, 25);
    gridOverlay.setFont(fontRenderer);
    fontSelect.value = defaultFont;
    fontPreview.src = `./ui/fontz/${defaultFont}.png`;
    fontLabel.innerText = defaultFont;
    sauceDefaults();
    setCursorPos(1,1);
    modalClose();
  });

  //--------------- modal
  $$$<HTMLButtonElement>('.cancel').forEach(
    c=>add(c,_=>modalClose()));
  add(modal, e=>{if(e.target === modal) modalClose()});

  //--------------- file loading
  initFileLoading();

  //--------------- SAUCE population event listener
  eventBus.subscribe('local:sauce:populate', ({sauce})=>{
    populateSauceForm(sauce);
  });

  //--------------- Canvas resize event listener
  eventBus.subscribe('ui:canvas:resize', ({columns, rows})=>{
    displayRes(columns, rows);
  });

  //--------------- ICE colors state listener
  eventBus.subscribe('ui:ice:changed', ({ice: iceEnabled})=>{
    // Update ICE button appearance to show current state
    cl(ice, 'selected', iceEnabled);
    console.log('ice event toggle');
  });
}

/**
 * Initialize file loading functionality
 */
function initFileLoading() {
  // Create hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.ans,.xb,.bin,.txt';
  fileInput.style.display = 'none';
  fileInput.id = 'hiddenFileInput';
  document.body.appendChild(fileInput);

  // Handle file selection
  fileInput.addEventListener('change', (event)=>{
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      void (async()=>{
        const {loadAnsiFile} = await import('./fileLoader');
        await loadAnsiFile(file);
        // Clear the input so the same file can be loaded again
        fileInput.value = '';
      })();
    }
  });

  // Add keyboard shortcut (Ctrl+O/Cmd+O)
  document.addEventListener('keydown', (event)=>{
    if ((event.ctrlKey || event.metaKey) && event.key === 'o') {
      event.preventDefault();
      fileInput.click();
    }
  });

  // Add drag and drop support
  let dragCounter = 0;

  document.addEventListener('dragenter', (event)=>{
    event.preventDefault();
    dragCounter++;
    document.body.classList.add('dragging');
  });

  document.addEventListener('dragleave', (event)=>{
    event.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      document.body.classList.remove('dragging');
    }
  });

  document.addEventListener('dragover', (event)=>{
    event.preventDefault();
  });

  document.addEventListener('drop', (event)=>{
    event.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('dragging');

    const files = event.dataTransfer?.files;
    if (files?.[0]) {
      void (async()=>{
        const {loadAnsiFile} = await import('./fileLoader');
        await loadAnsiFile(files[0]);
      })();
    }
  });
}

/**
 * Populate SAUCE form with metadata
 */
function populateSauceForm(sauce: SauceMetadata | null): void {
  if (sauce) {
    if (sauce.title) sauceTitle.value = sauce.title;
    if (sauce.author) sauceAuthor.value = sauce.author;
    if (sauce.group) sauceGroup.value = sauce.group;
    if (sauce.comments) sauceComments.value = sauce.comments;

    // Update navigation title to match
    if (sauce.title) navTitle.value = sauce.title;

    // Trigger existing byte count update
    enforceMaxBytes();
  } else {
    // Use existing defaults function
    sauceDefaults();
  }
}
