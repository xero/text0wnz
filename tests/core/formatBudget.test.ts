import { describe, it, expect } from 'vitest';
import {
	FONT_SLOT_UNSCII,
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../../src/js/core/doc.js';
import { ATTR_BLINK } from '../../src/js/core/doc.js';
import {
	describeIssue,
	lintDocForFormat,
} from '../../src/js/core/formatBudget.js';

const makeDoc = () => {
	const doc = createDocV3({ columns: 8, rows: 2 });
	// classic cell
	doc.setCell(0, 0, 0, {
		glyph: glyphWord(65, 0),
		fg: paletteColor(7),
		bg: paletteColor(0),
	});
	return doc;
};

describe('lintDocForFormat', () => {
	it('clean classic docs pass every format', () => {
		const doc = makeDoc();
		for (const format of ['ans', 'bin', 'xbin', 'tnd', 'txt'] as const) {
			expect(lintDocForFormat(doc, format).ok).toBe(true);
		}
	});

	it('utf8 and ownz hold unicode and truecolor without issues', () => {
		const doc = makeDoc();
		const han = doc.glyphTable.idFor(FONT_SLOT_UNSCII, 0x4e2d);
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(han, 0),
			fg: rgbColor(1, 2, 3),
			bg: paletteColor(0),
		});
		expect(lintDocForFormat(doc, 'utf8').ok).toBe(true);
		expect(lintDocForFormat(doc, 'ownz').ok).toBe(true);
	});

	it('flags the control positions the character writers substitute', () => {
		const doc = makeDoc();
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(10, 0), // LF position: the writers voice 9
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		for (const format of ['utf8', 'ans', 'txt'] as const) {
			const report = lintDocForFormat(doc, format);
			expect(
				report.issues.some(issue => issue.kind === 'control-lookalike'),
			).toBe(true);
		}
		// ownz emits them verbatim
		expect(lintDocForFormat(doc, 'ownz').ok).toBe(true);
	});

	it('counts unicode glyphs and extended colors for classic formats', () => {
		const doc = makeDoc();
		const han = doc.glyphTable.idFor(FONT_SLOT_UNSCII, 0x4e2d);
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(han, 0),
			fg: rgbColor(1, 2, 3),
			bg: paletteColor(0),
		});
		doc.setCell(0, 2, 0, {
			glyph: glyphWord(219, 0),
			fg: paletteColor(7),
			bg: rgbColor(9, 9, 9),
		});
		const report = lintDocForFormat(doc, 'ans');
		expect(report.ok).toBe(false);
		const kinds = Object.fromEntries(
			report.issues.map(issue => [issue.kind, issue]),
		);
		expect(kinds['unicode-glyph'].count).toBe(1);
		expect(kinds['unicode-glyph'].firstIndex).toBe(1);
		expect(kinds['color-beyond-16'].count).toBe(2);
		// the plain-text writer emits REAL codepoints: flagging unicode
		// cells there was a false positive on every such export
		const txt = lintDocForFormat(doc, 'txt');
		expect(txt.ok).toBe(true);
	});

	it('scans every frame, not just the first', () => {
		const doc = makeDoc();
		doc.addFrame();
		const han = doc.glyphTable.idFor(FONT_SLOT_UNSCII, 0x4e2d);
		doc.setCell(1, 1, 0, {
			glyph: glyphWord(han, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		const report = lintDocForFormat(doc, 'ans');
		expect(report.issues.some(issue => issue.kind === 'unicode-glyph')).toBe(
			true,
		);
	});

	it('tnd flags glyph 0 only when it has a background to lose', () => {
		const doc = makeDoc();
		// a fresh doc is full of glyph-0 cells on default bg: clean
		expect(
			lintDocForFormat(doc, 'tnd').issues.some(
				issue => issue.kind === 'tnd-control-glyph',
			),
		).toBe(false);
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(0, 0),
			fg: paletteColor(7),
			bg: paletteColor(4),
		});
		expect(
			lintDocForFormat(doc, 'tnd').issues.some(
				issue => issue.kind === 'tnd-control-glyph',
			),
		).toBe(true);
	});

	it('flags tundra control glyphs and blink', () => {
		const doc = makeDoc();
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(3, 0), // ♥
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		doc.setCell(0, 2, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		const report = lintDocForFormat(doc, 'tnd');
		const kinds = report.issues.map(issue => issue.kind).sort();
		expect(kinds).toEqual(['tnd-blink', 'tnd-control-glyph']);
		// tundra holds truecolor: RGB words are NOT an issue there
		doc.setCell(0, 3, 0, {
			glyph: glyphWord(66, 0),
			fg: rgbColor(5, 6, 7),
			bg: paletteColor(0),
		});
		expect(
			lintDocForFormat(doc, 'tnd').issues.some(
				issue => issue.kind === 'color-beyond-16',
			),
		).toBe(false);
	});

	it('describes every issue kind as a human line', () => {
		expect(
			describeIssue({ kind: 'unicode-glyph', count: 2, firstIndex: 0 }),
		).toContain('2 unicode cells');
		expect(
			describeIssue({ kind: 'tnd-blink', count: 1, firstIndex: 0 }),
		).toContain('blink');
	});
});

describe('ice-blink', () => {
	it('flags blink attrs inside an ice doc for 16c formats', () => {
		const doc = createDocV3({ columns: 2, rows: 1, iceColors: true });
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		const kinds = lintDocForFormat(doc, 'ans').issues.map(issue => issue.kind);
		expect(kinds).toEqual(['ice-blink']);
		// non-ice docs fold blink legitimately: no flag
		const plain = createDocV3({ columns: 2, rows: 1 });
		plain.setCell(0, 0, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		expect(lintDocForFormat(plain, 'ans').ok).toBe(true);
	});
});

describe('bright-bg-folds', () => {
	it('flags steady bright backgrounds in non-ice docs', () => {
		const doc = createDocV3({ columns: 2, rows: 1, mode: 'free' });
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(7),
			bg: paletteColor(9),
		});
		const report = lintDocForFormat(doc, 'ans');
		const kinds = report.issues.map(i => i.kind);
		expect(kinds).toContain('bright-bg-folds');
	});

	it('stays quiet under ice and for folded blink cells', () => {
		const ice = createDocV3({ columns: 1, rows: 1, iceColors: true });
		ice.setCell(0, 0, 0, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(7),
			bg: paletteColor(9),
		});
		expect(lintDocForFormat(ice, 'ans').issues.map(i => i.kind)).not.toContain(
			'bright-bg-folds',
		);
	});
});
