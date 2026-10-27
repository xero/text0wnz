/**
 * Minimal libtextmode shim for the vendored moebiusXBIN server
 * fixture: exactly the four functions server.js calls, with compress,
 * uncompress, and resize_canvas transcribed VERBATIM from upstream
 * (libtextmode.js / textmode.js; resize_canvas minus its electron
 * window probe, which is dead in node). read_file returns a fresh
 * 80x25 document shaped like the fork's own: `palette_4bit` as
 * sixteen {r, g, b} objects in 8-BIT components (palette.js:2-19; the
 * fork dropped vanilla's 6-bit palette and ships these raw), plus,
 * when FIXTURE_FONT_BYTES is set, `font_bytes` as a node Buffer the
 * way an .xb server file with an embedded font arrives (xbin.js:68
 * via fs.readFile), which JSON.stringify turns into Buffer JSON on
 * the wire. write_file is a no-op (the fixture never persists).
 *
 * Source: https://github.com/hlotvonen/moebiusXBIN (v2.2.0, commit
 * 3e792e5). Upstream license: Apache-2.0. Vendored for protocol
 * interop testing only.
 */

/* eslint-disable */

// upstream palette_4bit (palette.js), the join doc palette as sent
const palette_4bit = [
    { r: 0x00, g: 0x00, b: 0x00 }, { r: 0x00, g: 0x00, b: 0xaa },
    { r: 0x00, g: 0xaa, b: 0x00 }, { r: 0x00, g: 0xaa, b: 0xaa },
    { r: 0xaa, g: 0x00, b: 0x00 }, { r: 0xaa, g: 0x00, b: 0xaa },
    { r: 0xaa, g: 0x55, b: 0x00 }, { r: 0xaa, g: 0xaa, b: 0xaa },
    { r: 0x55, g: 0x55, b: 0x55 }, { r: 0x55, g: 0x55, b: 0xff },
    { r: 0x55, g: 0xff, b: 0x55 }, { r: 0x55, g: 0xff, b: 0xff },
    { r: 0xff, g: 0x55, b: 0x55 }, { r: 0xff, g: 0x55, b: 0xff },
    { r: 0xff, g: 0xff, b: 0x55 }, { r: 0xff, g: 0xff, b: 0xff },
];

// an 8x16 font blob the size the fork embeds (256 glyphs * 16 rows),
// patterned so a receiver can prove it revived the bytes, not a stub
function fixture_font_bytes() {
    const bytes = Buffer.alloc(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    return bytes;
}

function compress(doc) {
    const compressed_data = { code: [], fg: [], bg: [] };
    for (let i = 0, code_repeat = 0, fg_repeat = 0, bg_repeat = 0; i < doc.data.length; i++) {
        const block = doc.data[i];
        if (i + 1 == doc.data.length) {
            compressed_data.code.push([block.code, code_repeat]);
            compressed_data.fg.push([block.fg, fg_repeat]);
            compressed_data.bg.push([block.bg, bg_repeat]);
        } else {
            const next_block = doc.data[i + 1];
            if (block.code != next_block.code) {
                compressed_data.code.push([block.code, code_repeat]);
                code_repeat = 0;
            } else {
                code_repeat += 1;
            }
            if (block.fg != next_block.fg) {
                compressed_data.fg.push([block.fg, fg_repeat]);
                fg_repeat = 0;
            } else {
                fg_repeat += 1;
            }
            if (block.bg != next_block.bg) {
                compressed_data.bg.push([block.bg, bg_repeat]);
                bg_repeat = 0;
            } else {
                bg_repeat += 1;
            }
        }
    }
    return { columns: doc.columns, rows: doc.rows, title: doc.title, author: doc.author, group: doc.group, date: doc.date, palette: doc.palette, font_bytes: doc.font_bytes, font_name: doc.font_name, ice_colors: doc.ice_colors, use_9px_font: doc.use_9px_font, comments: doc.comments, compressed_data, c64_background: doc.c64_background };
}

function uncompress(doc) {
    if (doc.compressed_data) {
        const codes = [];
        const fgs = [];
        const bgs = [];
        for (const code of doc.compressed_data.code) {
            for (let i = 0; i <= code[1]; i++) codes.push(code[0]);
        }
        for (const fg of doc.compressed_data.fg) {
            for (let i = 0; i <= fg[1]; i++) fgs.push(fg[0]);
        }
        for (const bg of doc.compressed_data.bg) {
            for (let i = 0; i <= bg[1]; i++) bgs.push(bg[0]);
        }
        doc.data = new Array(codes.length);
        for (let i = 0; i < doc.data.length; i++) doc.data[i] = { code: codes[i], fg: fgs[i], bg: bgs[i] };
        delete doc.compressed_data;
    }
    return doc;
}

function resize_canvas(doc, columns, rows) {
    const min_rows = Math.min(doc.rows, rows);
    const min_columns = Math.min(doc.columns, columns);
    const new_data = new Array(columns * rows);
    for (let i = 0; i < new_data.length; i++) {
        new_data[i] = ({code: 32, fg: 7, bg: 0});
    }
    for (let y = 0; y < min_rows; y++) {
        for (let x = 0; x < min_columns; x++) {
            new_data[y * columns + x] = doc.data[y * doc.columns + x];
        }
    }
    doc.data = new_data;
    doc.columns = columns;
    doc.rows = rows;
}

async function read_file(_file) {
    const columns = 80;
    const rows = 25;
    const data = new Array(columns * rows);
    for (let i = 0; i < data.length; i++) {
        data[i] = {code: 32, fg: 7, bg: 0};
    }
    return {
        columns,
        rows,
        data,
        title: 'fixture',
        author: '',
        group: '',
        date: '',
        palette: [...palette_4bit],
        font_bytes: process.env.FIXTURE_FONT_BYTES ? fixture_font_bytes() : undefined,
        font_name: 'IBM VGA',
        ice_colors: false,
        use_9px_font: false,
        comments: '',
    };
}

function write_file(_doc, _file) {
    // the fixture never persists
}

module.exports = { compress, uncompress, resize_canvas, read_file, write_file };
