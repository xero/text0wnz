// top-level UI orchestrator: handles global UI events, tool switching,
// dialog logic, delegations to toolManager
import type {GlobalState} from './state';
import type {PubSub} from './eventBus';

/* <--//-----------------------------------------------------------[helpers] */
const
  D = document,
  W = window,
  $ = (i: string)=>{ const e = D.getElementById(i); if (!e) throw new Error(`Element #${i} not found`); return e },
  $$ = <T extends Element = HTMLElement>(q: string): T=>{ const e = D.querySelector(q); if (!e) throw new Error(`Element ${q} was not found`); return e as T; },
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
  fileOpen:HTMLElement,
  fileUpload:HTMLInputElement,
  fileJoint:HTMLElement,
  fontSelect:HTMLSelectElement,
  fontPreview:HTMLImageElement,
  curColors:HTMLCanvasElement,
  palettePrev:HTMLCanvasElement,
  art:HTMLCanvasElement;

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
  chatNew= $('chatNew');
  jointCancel = $('jointCancel');
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
  fileOpen = $('fileOpen');
  fileJoint = $('fileJoint');
  fileUpload = $$<HTMLInputElement>('#fileUpload');
  fontSelect = $$<HTMLSelectElement>('#fontName');
  fontPreview = $$<HTMLImageElement>('#fontPreview');
  curColors = $$<HTMLCanvasElement>('#currentColors');
  palettePrev = $$<HTMLCanvasElement>('#paletteColors');
  art = $$<HTMLCanvasElement>('#art');
}

/* <--//----------------------------------------------------------[internal] */

const initCanvas = (canvas:HTMLCanvasElement, name:string):CanvasRenderingContext2D=>{
  const ctx = canvas.getContext('2d');
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
const cloudHide=():void=>clouds.forEach(i=>cl(i,'hide',true));
const cloudShow=(cloud:string):void=>{
  cloudHide();
  cl($(`${cloud}Cloud`), 'hide', false);
};
const navChat=(screen:string)=>{
  [chatResolution,chatJoints,chatRoom,chatNew].forEach(s=>cl(s,'hide',true));
  cl($(`chat${screen.charAt(0).toUpperCase()}${screen.slice(1).toLowerCase()}`),'hide',false);
  cl(screen==="resolution" ? resolution : chat, 'selected', true);
  cl(chatz,'hide',false);
};
const toggleChatRes=(w:string):void=>{
  const
    c:boolean=has(chat,'selected'),
    r:boolean=has(resolution, 'selected');
  [chat, resolution].forEach(s=>cl(s,'selected',false));
  if(
    (w==='chat' && r)||(w==='resolution' && c)||
    ((w==='chat'||w==='resolution') && (!r && !c))
  ){
    if(w==="chat"){
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

const toolOps = (tool:string, subtool:boolean=false)=>{
 if(subtool==false) toolOpsHide();
  cl($(`${tool}Opts`), 'hide', false);
};

//---color palette
type RGB6Bit = [number, number, number]; // values: 0–63
type RGBA = Uint8Array; // [r, g, b, a], 0–255
interface Palette {
	getRGBAcolor: (index: number) => RGBA;
	getForegroundcolor: () => number;
	getBackgroundcolor: () => number;
	setForegroundcolor: (newForeground: number) => void;
	setBackgroundcolor: (newBackground: number) => void;
}

const createPalette = (RGB6Bit: RGB6Bit[]): Palette=>{
  const RGBAcolors: RGBA[] = RGB6Bit.map((rgb: RGB6Bit): RGBA=>{
    return new Uint8Array([
      (rgb[0] << 2) | (rgb[0] >> 4),
      (rgb[1] << 2) | (rgb[1] >> 4),
      (rgb[2] << 2) | (rgb[2] >> 4),
      255
    ]);
  });
	let foreground = 7;
	let background = 0;
  const
    getRGBAcolor = (index: number) :RGBA=>RGBAcolors[index],
    getForegroundcolor = (): number=>foreground,
    getBackgroundcolor = (): number=>background,
    setForegroundcolor = (newForeground: number): void=>{
      foreground = newForeground;
      document.dispatchEvent(new CustomEvent<number>('onForegroundChange',
        {detail: foreground}));
    },
    setBackgroundcolor = (newBackground: number): void=>{
      background = newBackground;
      document.dispatchEvent(new CustomEvent<number>('onBackgroundChange',
        {detail: background}));
    };
	return {
		getRGBAcolor,
		getForegroundcolor,
		getBackgroundcolor,
		setForegroundcolor,
		setBackgroundcolor
	};
}

function createDefaultPalette(): Palette {
	'use strict';
	return createPalette([
		[0, 0, 0],
		[0, 0, 42],
		[0, 42, 0],
		[0, 42, 42],
		[42, 0, 0],
		[42, 0, 42],
		[42, 21, 0],
		[42, 42, 42],
		[21, 21, 21],
		[21, 21, 63],
		[21, 63, 21],
		[21, 63, 63],
		[63, 21, 21],
		[63, 21, 63],
		[63, 63, 21],
		[63, 63, 63]
	]);
}

interface PalettePreview{
	setForegroundcolor:()=>void;
	setBackgroundcolor:()=>void;
}

const createCurrentColors = (canvas: HTMLCanvasElement, paletteObj: Palette): PalettePreview=>{
  const updatePreview = (): void=>{
    const
      size = Math.min(canvas.clientWidth, canvas.clientHeight),
      swatch = Math.round(size * 0.6),
      offset = size - swatch,
      ctx = initCanvas(canvas,'#currentColors');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = `rgba(${paletteObj.getRGBAcolor(paletteObj.getBackgroundcolor()).join(',')})`;
    ctx.fillRect(offset, offset, swatch, swatch);
    ctx.fillStyle = `rgba(${paletteObj.getRGBAcolor(paletteObj.getForegroundcolor()).join(',')})`;
    ctx.fillRect(0, 0, swatch, swatch);
  };
	updatePreview();
	document.addEventListener('onForegroundChange', updatePreview);
	document.addEventListener('onBackgroundChange', updatePreview);

	return {
		setForegroundcolor: updatePreview,
		setBackgroundcolor: updatePreview
	};
}

interface PalettePicker {
	updatePalette: () => void;
}

const createPalettePicker = (canvas: HTMLCanvasElement, paletteObj: Palette): PalettePicker=>{
  const ctx = initCanvas(canvas, 'paletteColors');
  const
    imageData: ImageData[] = [],
    cols = 8, rows = 2,
    swatchWidth = canvas.width / cols,
    swatchHeight = canvas.height / rows;
  for (let i = 0; i < 16; i++) {
    imageData[i] = ctx.createImageData(swatchWidth + 1, swatchHeight);
  }
  const updateColor = (index: number): void=>{
    const color = paletteObj.getRGBAcolor(index);
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
  },
	updatePalette = (): void=>{
		for (let i = 0; i < 16; i++){
			updateColor(i);
		}
	}
	updatePalette();
	return {
		updatePalette
	};
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

//
/* <--//----------------------------------------------------------[external] */
export function initUI(state:GlobalState, eventBus:PubSub) {
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

  //--------------- font config
  fontSelect.addEventListener('change', e=>{
    const name = (e.target as HTMLSelectElement).value;
    $('fontMeta').innerText = name;
    fontPreview.onload = ()=>{
      fontPreview.style.width  = `${String(fontPreview.naturalWidth * 1.5)}px`;
      fontPreview.style.height = `${String(fontPreview.naturalHeight * 1.5)}px`;
      fontPreview.onload = null;
    };
    fontPreview.src = `/ui/fontz/${name}.png`;
  })
  add(font,_=>modalShow('fonts'));
  /* @TODO: REMOVEPLACEHOLDER */
  fontSelect.value = 'TOPAZ_437';
  fontSelect.dispatchEvent(new Event('change', {bubbles: true}));

  //--------------- file config
  [fileOpen,splashOpen].forEach(
    b=>add(b,_=>fileUpload.click())
  );
  fileUpload.addEventListener('change', _=>{
    alert(`got: ${fileUpload.files}`);
  });
  add(fileJoint,_=>navChat('joints'));
  add(open,_=>modalShow('file'));
  title.value="untitled";

  //--------------- chatz
  cloudShow('offline');
  add(chat,_=>toggleChatRes('chat'));
  add(chatLeave,_=>navChat('joints'));
  /* @TODO: check if in a joint already before defaulting to chat */
  add(jointCancel,_=>navChat('room'));

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

  //--------------- colors
	const palette = createDefaultPalette();
  const palettePicker = createPalettePicker(palettePrev, palette);
  const paletteCurrent = createCurrentColors(curColors, palette);
  add(curColors, ()=>{
    const tempForeground = palette.getForegroundcolor();
    palette.setForegroundcolor(palette.getBackgroundcolor());
    palette.setBackgroundcolor(tempForeground);
  });
  // Listen for palette changes and update picker
  document.addEventListener('onPaletteChange', ()=>{
    palettePicker.updatePalette();
  });
  document.dispatchEvent(new CustomEvent('onPaletteChange'));

  //--------------- modal
  $$$<HTMLButtonElement>('.cancel').forEach(
    c=>add(c,_=>modalClose()));
  add(modal, e=>{if(e.target === modal) modalClose()});
  add(splashJoint,_=>navChat('joints'));
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
