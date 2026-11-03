// @ts-check
/**
 * A timed touch hold: iOS never synthesizes contextmenu for a touch
 * hold, and Android's native one arrives wrapped in selection chrome,
 * so a hold gets its own timer; mice, pens and trackpads keep the real
 * contextmenu. Wandering past the slop is a drag or a scroll, and a
 * second finger is a pinch, never a hold
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
	// lifts land on the document even when pointer capture retargets
	// them away from the armed element; a hold must never survive its
	// own finger
	/** @param {() => void} end */
	const lift = end => /** @param {PointerEvent} e */ e => {
		if (hold && e.pointerId === hold.pointerId) {
			end();
		}
	};
	document.addEventListener('pointerup', lift(disarm), true);
	document.addEventListener('pointercancel', lift(drop), true);
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
		 * Arms on a primary touch press and ignores any other
		 * @param {PointerEvent} e
		 * @param {() => void} fire
		 * @param {() => void} [cancel] runs when the press is dropped
		 */
		arm: (e, fire, cancel) => {
			if (e.pointerType !== 'touch' || !e.isPrimary) {
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
		/** @param {PointerEvent} e */
		move: e => {
			if (
				hold &&
				Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > LONG_PRESS_SLOP_PX
			) {
				drop();
			}
		},
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
