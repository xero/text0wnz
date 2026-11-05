// @ts-check
/**
 * A timed hold for fingers and pens: iPadOS never synthesizes
 * contextmenu for a finger or Pencil hold, and a Pencil has no other
 * way to right-click, while Android's native one arrives wrapped in
 * selection chrome, so a hold gets its own timer; mice and trackpads
 * keep the real contextmenu. Wandering past the slop is a drag or a
 * scroll, and a second finger is a pinch, never a hold
 */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 8;

const createTouchHold = () => {
	/** @type {{x: number, y: number, pointerId: number, timer: ReturnType<typeof setTimeout>, run: () => void, cancel?: () => void}|null} */
	let hold = null;
	const disarm = () => {
		if (hold) {
			clearTimeout(hold.timer);
			hold = null;
		}
	};
	// a plain lift may still be a tap; a wander, a second finger, or a
	// cancel is neither a hold nor a tap
	const drop = () => {
		const cancel = hold?.cancel;
		disarm();
		cancel?.();
	};
	/** @param {PointerEvent} e */
	const move = e => {
		if (
			hold &&
			Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > LONG_PRESS_SLOP_PX
		) {
			drop();
		}
	};
	// the press's own events land on the document wherever they go:
	// pointer capture retargets a lift away from the armed element, and
	// a desktop pen has no implicit capture, so its moves stop reaching
	// the element once it slides off. A hold must never outlive its own
	// lift or wander
	/** @param {(e: PointerEvent) => void} end */
	const own = end => /** @param {PointerEvent} e */ e => {
		if (hold && e.pointerId === hold.pointerId) {
			end(e);
		}
	};
	document.addEventListener('pointerup', own(disarm), true);
	document.addEventListener('pointercancel', own(drop), true);
	document.addEventListener('pointermove', own(move), true);
	document.addEventListener(
		'pointerdown',
		e => {
			if (hold && e.pointerId !== hold.pointerId) {
				drop();
			}
		},
		true,
	);

	return {
		/**
		 * Arms on a primary touch or pen press and ignores any other
		 * @param {PointerEvent} e
		 * @param {() => void} fire
		 * @param {() => void} [cancel] runs when the press is dropped
		 */
		arm: (e, fire, cancel) => {
			if ((e.pointerType !== 'touch' && e.pointerType !== 'pen') || !e.isPrimary) {
				return;
			}
			disarm();
			const { clientX: x, clientY: y, pointerId } = e;
			const run = () => {
				hold = null;
				fire();
			};
			hold = {
				x,
				y,
				pointerId,
				run,
				cancel,
				timer: setTimeout(run, LONG_PRESS_MS),
			};
		},
		move,
		// a native long-press contextmenu can beat the timer, and the
		// press still fires once
		flush: () => {
			if (hold) {
				clearTimeout(hold.timer);
				hold.run();
			}
		},
	};
};

export { createTouchHold, LONG_PRESS_MS, LONG_PRESS_SLOP_PX };
