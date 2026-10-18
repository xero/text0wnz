import { describe, it, expect, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { createSegmentedControl } from '../../src/js/client/ui.js';

vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

const MODES = [
	{ value: 'block', label: 'Block', glyph: '▀▄▀' },
	{ value: 'oldskool', label: 'Old Skool', glyph: '.-\'' },
	{ value: 'nuskool', label: 'Nu Skool', glyph: ',d$P' },
];

const build = onChange => {
	const control = createSegmentedControl('testMode', MODES, onChange);
	document.body.appendChild(control.getElement());
	return control;
};

const segment = value =>
	document.querySelector(`#testMode [data-value="${value}"]`);

describe('Segmented Control DOM Tests', () => {
	let user;

	beforeEach(() => {
		document.body.innerHTML = '';
		user = userEvent.setup();
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('renders a radiogroup of radio buttons with data values', () => {
			build(vi.fn());
			const group = document.getElementById('testMode');
			expect(group).toHaveAttribute('role', 'radiogroup');
			const radios = group.querySelectorAll('button[role="radio"]');
			expect(radios).toHaveLength(3);
			expect(segment('oldskool')).toBeInTheDocument();
		});

		it('renders glyph previews above the labels', () => {
			build(vi.fn());
			const glyph = segment('nuskool').querySelector('samp');
			expect(glyph).toHaveTextContent(',d$P');
			expect(segment('nuskool').querySelector('span')).toHaveTextContent(
				'Nu Skool',
			);
		});

		it('skips the glyph element when none is given', () => {
			const control = createSegmentedControl(
				'plain',
				[{ value: 'a', label: 'A' }],
				vi.fn(),
			);
			document.body.appendChild(control.getElement());
			expect(document.querySelector('#plain samp')).toBeNull();
		});

		it('starts on the first option', () => {
			const control = build(vi.fn());
			expect(control.value()).toBe('block');
			expect(segment('block')).toHaveClass('enabled');
			expect(segment('block')).toHaveAttribute('aria-checked', 'true');
			expect(segment('oldskool')).toHaveAttribute('aria-checked', 'false');
		});
	});

	describe('selection', () => {
		it('a click selects and fires onChange once', async () => {
			const onChange = vi.fn();
			const control = build(onChange);
			await user.click(segment('nuskool'));
			expect(control.value()).toBe('nuskool');
			expect(onChange).toHaveBeenCalledExactlyOnceWith('nuskool');
			expect(segment('nuskool')).toHaveClass('enabled');
			expect(segment('block')).not.toHaveClass('enabled');
		});

		it('clicking the current value fires nothing', async () => {
			const onChange = vi.fn();
			build(onChange);
			await user.click(segment('block'));
			expect(onChange).not.toHaveBeenCalled();
		});

		it('set moves the selection without firing onChange', () => {
			const onChange = vi.fn();
			const control = build(onChange);
			control.set('oldskool');
			expect(control.value()).toBe('oldskool');
			expect(segment('oldskool')).toHaveClass('enabled');
			expect(onChange).not.toHaveBeenCalled();
		});

		it('set ignores unknown values', () => {
			const control = build(vi.fn());
			control.set('bogus');
			expect(control.value()).toBe('block');
		});

		it('only the selected segment is tabbable', () => {
			const control = build(vi.fn());
			control.set('nuskool');
			expect(segment('nuskool').tabIndex).toBe(0);
			expect(segment('block').tabIndex).toBe(-1);
		});
	});

	describe('keyboard', () => {
		it('arrows move the selection and fire onChange', async () => {
			const onChange = vi.fn();
			const control = build(onChange);
			segment('block').focus();
			await user.keyboard('{ArrowRight}');
			expect(control.value()).toBe('oldskool');
			expect(onChange).toHaveBeenCalledExactlyOnceWith('oldskool');
			expect(segment('oldskool')).toHaveFocus();
		});

		it('arrows wrap at both ends', async () => {
			const control = build(vi.fn());
			segment('block').focus();
			await user.keyboard('{ArrowLeft}');
			expect(control.value()).toBe('nuskool');
			await user.keyboard('{ArrowDown}');
			expect(control.value()).toBe('block');
		});
	});

	describe('disabled state', () => {
		it('setEnabled(false) dims and leaves the tab order', () => {
			const control = build(vi.fn());
			control.setEnabled(false);
			expect(control.getElement()).toHaveClass('dimmed');
			expect(control.getElement()).toHaveAttribute('aria-disabled', 'true');
			expect(segment('block').tabIndex).toBe(-1);
			expect(segment('oldskool').tabIndex).toBe(-1);
			expect(segment('nuskool').tabIndex).toBe(-1);
		});

		it('a disabled control ignores clicks and arrows', async () => {
			const onChange = vi.fn();
			const control = build(onChange);
			control.setEnabled(false);
			await user.click(segment('oldskool'));
			segment('block').focus();
			await user.keyboard('{ArrowRight}');
			expect(control.value()).toBe('block');
			expect(onChange).not.toHaveBeenCalled();
		});

		it('silent set still works while disabled', () => {
			const control = build(vi.fn());
			control.setEnabled(false);
			control.set('nuskool');
			expect(control.value()).toBe('nuskool');
			expect(segment('nuskool')).toHaveClass('enabled');
		});

		it('setEnabled(true) restores input and the tab order', async () => {
			const onChange = vi.fn();
			const control = build(onChange);
			control.setEnabled(false);
			control.setEnabled(true);
			expect(control.getElement()).not.toHaveClass('dimmed');
			expect(segment('block').tabIndex).toBe(0);
			await user.click(segment('oldskool'));
			expect(onChange).toHaveBeenCalledExactlyOnceWith('oldskool');
		});
	});
});
