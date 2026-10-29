/* global InputEvent, CompositionEvent -- browser builtins; the shared
   eslint env predates them */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import { onEnter, onReturn } from '../../src/js/client/ui.js';

vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

/* Android IMEs deliver the action key as keydown with e.key set and
   e.code empty, or as a bare beforeinput line break; desktop delivers
   a classic keydown. onEnter must hear all of them and nothing else. */
describe('onEnter', () => {
	let input;
	let fired;

	beforeEach(() => {
		document.body.innerHTML = '';
		input = document.createElement('input');
		input.type = 'text';
		document.body.appendChild(input);
		fired = vi.fn();
		onEnter(input, fired);
	});

	const keydown = init =>
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

	it('fires on a desktop Enter keydown', () => {
		const e = keydown({ key: 'Enter', code: 'Enter' });
		input.dispatchEvent(e);
		expect(fired).toHaveBeenCalledTimes(1);
		expect(e.defaultPrevented).toBe(true);
	});

	it('fires on the Android IME shape: key Enter with an empty code', () => {
		const e = keydown({ key: 'Enter', code: '' });
		input.dispatchEvent(e);
		expect(fired).toHaveBeenCalledTimes(1);
	});

	it('never fires from the legacy keypress event', () => {
		input.dispatchEvent(
			new KeyboardEvent('keypress', {
				key: 'Enter',
				code: 'Enter',
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(fired).not.toHaveBeenCalled();
	});

	it('leaves a composing Enter to the IME', () => {
		input.dispatchEvent(keydown({ key: 'Enter', isComposing: true }));
		expect(fired).not.toHaveBeenCalled();
	});

	it('leaves the WebKit commit stroke to the IME: compositionend then a bare Enter', () => {
		// Safari fires compositionend BEFORE the committing keydown and
		// strips isComposing from it; only the fresh compositionend
		// gives that keydown away
		const now = vi.spyOn(Date, 'now');
		try {
			now.mockReturnValue(10_000);
			input.dispatchEvent(new CompositionEvent('compositionend', { data: '猫' }));
			input.dispatchEvent(keydown({ key: 'Enter', code: '' }));
			expect(fired).not.toHaveBeenCalled();
			// the next deliberate Enter, well past the commit, acts
			now.mockReturnValue(10_500);
			input.dispatchEvent(keydown({ key: 'Enter', code: '' }));
			expect(fired).toHaveBeenCalledTimes(1);
		} finally {
			now.mockRestore();
		}
	});

	it('leaves a 229 keydown to the IME', () => {
		const e = keydown({ key: 'Enter', code: '' });
		Object.defineProperty(e, 'keyCode', { value: 229 });
		input.dispatchEvent(e);
		expect(fired).not.toHaveBeenCalled();
	});

	it('leaves a composing beforeinput line break to the IME', () => {
		input.dispatchEvent(
			new InputEvent('beforeinput', {
				inputType: 'insertLineBreak',
				isComposing: true,
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(fired).not.toHaveBeenCalled();
	});

	it('leaves modified Enter presses alone', () => {
		input.dispatchEvent(keydown({ key: 'Enter', ctrlKey: true }));
		input.dispatchEvent(keydown({ key: 'Enter', altKey: true }));
		input.dispatchEvent(keydown({ key: 'Enter', metaKey: true }));
		expect(fired).not.toHaveBeenCalled();
	});

	it('ignores other keys', () => {
		input.dispatchEvent(keydown({ key: 'a', code: 'KeyA' }));
		input.dispatchEvent(keydown({ key: 'Escape', code: 'Escape' }));
		expect(fired).not.toHaveBeenCalled();
	});

	it('fires on a beforeinput line break and cancels it', () => {
		const e = new InputEvent('beforeinput', {
			inputType: 'insertLineBreak',
			bubbles: true,
			cancelable: true,
		});
		input.dispatchEvent(e);
		expect(fired).toHaveBeenCalledTimes(1);
		expect(e.defaultPrevented).toBe(true);
	});

	it('ignores other beforeinput types', () => {
		input.dispatchEvent(
			new InputEvent('beforeinput', {
				inputType: 'insertText',
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(fired).not.toHaveBeenCalled();
	});

	it('keeps the soft-keyboard newline in a textarea, but a hard Enter acts', () => {
		const area = document.createElement('textarea');
		document.body.appendChild(area);
		const areaFired = vi.fn();
		onEnter(area, areaFired);

		// a line break is textarea content, so the input path stands down
		const brk = new InputEvent('beforeinput', {
			inputType: 'insertLineBreak',
			bubbles: true,
			cancelable: true,
		});
		area.dispatchEvent(brk);
		expect(areaFired).not.toHaveBeenCalled();
		expect(brk.defaultPrevented).toBe(false);

		area.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				code: 'Enter',
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(areaFired).toHaveBeenCalledTimes(1);
	});
});

describe('onReturn', () => {
	it('clicks the target on Enter', () => {
		document.body.innerHTML = '';
		const input = document.createElement('input');
		const button = document.createElement('button');
		const onClick = vi.fn();
		button.addEventListener('click', onClick);
		document.body.append(input, button);
		onReturn(input, button);

		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				code: '',
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});
