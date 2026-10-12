(function() {
	const e = [
		[1, 9786],
		[2, 9787],
		[3, 9829],
		[4, 9830],
		[5, 9827],
		[6, 9824],
		[7, 8226],
		[8, 9688],
		[9, 9675],
		[10, 9689],
		[11, 9794],
		[12, 9792],
		[13, 9834],
		[14, 9835],
		[15, 9788],
		[16, 9658],
		[17, 9668],
		[18, 8597],
		[19, 8252],
		[20, 182],
		[21, 167],
		[22, 9644],
		[23, 8616],
		[24, 8593],
		[25, 8595],
		[26, 8594],
		[27, 8592],
		[28, 8735],
		[29, 8596],
		[30, 9650],
		[31, 9660],
		[127, 8962],
		[128, 199],
		[129, 252],
		[130, 233],
		[131, 226],
		[132, 228],
		[133, 224],
		[134, 229],
		[135, 231],
		[136, 234],
		[137, 235],
		[138, 232],
		[139, 239],
		[140, 238],
		[141, 236],
		[142, 196],
		[143, 197],
		[144, 201],
		[145, 230],
		[146, 198],
		[147, 244],
		[148, 246],
		[149, 242],
		[150, 251],
		[151, 249],
		[152, 255],
		[153, 214],
		[154, 220],
		[155, 162],
		[156, 163],
		[157, 165],
		[158, 8359],
		[159, 402],
		[160, 225],
		[161, 237],
		[162, 243],
		[163, 250],
		[164, 241],
		[165, 209],
		[166, 170],
		[167, 186],
		[168, 191],
		[169, 8976],
		[170, 172],
		[171, 189],
		[172, 188],
		[173, 161],
		[174, 171],
		[175, 187],
		[176, 9617],
		[177, 9618],
		[178, 9619],
		[179, 9474],
		[180, 9508],
		[181, 9569],
		[182, 9570],
		[183, 9558],
		[184, 9557],
		[185, 9571],
		[186, 9553],
		[187, 9559],
		[188, 9565],
		[189, 9564],
		[190, 9563],
		[191, 9488],
		[192, 9492],
		[193, 9524],
		[194, 9516],
		[195, 9500],
		[196, 9472],
		[197, 9532],
		[198, 9566],
		[199, 9567],
		[200, 9562],
		[201, 9556],
		[202, 9577],
		[203, 9574],
		[204, 9568],
		[205, 9552],
		[206, 9580],
		[207, 9575],
		[208, 9576],
		[209, 9572],
		[210, 9573],
		[211, 9561],
		[212, 9560],
		[213, 9554],
		[214, 9555],
		[215, 9579],
		[216, 9578],
		[217, 9496],
		[218, 9484],
		[219, 9608],
		[220, 9604],
		[221, 9612],
		[222, 9616],
		[223, 9600],
		[224, 945],
		[225, 223],
		[226, 915],
		[227, 960],
		[228, 931],
		[229, 963],
		[230, 181],
		[231, 964],
		[232, 934],
		[233, 920],
		[234, 937],
		[235, 948],
		[236, 8734],
		[237, 966],
		[238, 949],
		[239, 8745],
		[240, 8801],
		[241, 177],
		[242, 8805],
		[243, 8804],
		[244, 8992],
		[245, 8993],
		[246, 247],
		[247, 8776],
		[248, 176],
		[249, 8729],
		[250, 183],
		[251, 8730],
		[252, 8319],
		[253, 178],
		[254, 9632],
		[0, 160],
		[255, 160]
	], t = (new Map(e), /* @__PURE__ */ new Map());
	for (const [T, S] of e) t.set(S, T);
	const r = (e) => 255 & ((63 & e) << 2 | (63 & e) >> 4), n = [
		[
			0,
			0,
			0
		],
		[
			0,
			0,
			42
		],
		[
			0,
			42,
			0
		],
		[
			0,
			42,
			42
		],
		[
			42,
			0,
			0
		],
		[
			42,
			0,
			42
		],
		[
			42,
			21,
			0
		],
		[
			42,
			42,
			42
		],
		[
			21,
			21,
			21
		],
		[
			21,
			21,
			63
		],
		[
			21,
			63,
			21
		],
		[
			21,
			63,
			63
		],
		[
			63,
			21,
			21
		],
		[
			63,
			21,
			63
		],
		[
			63,
			63,
			21
		],
		[
			63,
			63,
			63
		]
	], a = (new Map(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", (e, t) => [e, t])), "undefined" != typeof Intl && "Segmenter" in Intl && new Intl.Segmenter(void 0, { granularity: "grapheme" }), (() => {
		const e = /* @__PURE__ */ new Uint32Array(256);
		for (let t = 0; t < 256; t++) {
			let r = t;
			for (let e = 0; e < 8; e++) r = 1 & r ? 3988292384 ^ r >>> 1 : r >>> 1;
			e[t] = r >>> 0;
		}
	})(), (() => {
		const e = /* @__PURE__ */ new Map();
		(() => {
			const e = new Uint32Array(n.length);
			return n.forEach(([t, n, a], s) => {
				e[s] = ((e, t, r) => ((255 & e) << 16 | (255 & t) << 8 | 255 & r) >>> 0)(r(t), r(n), r(a));
			}), e;
		})().forEach((t, r) => {
			e.has(t) || e.set(t, r);
		});
	})(), Object.freeze({
		CONNECTED: 0,
		REFUSED: 1,
		JOIN: 2,
		LEAVE: 3,
		CURSOR: 4,
		SELECTION: 5,
		RESIZE_SELECTION: 6,
		OPERATION: 7,
		HIDE_CURSOR: 8,
		DRAW: 9,
		CHAT: 10,
		STATUS: 11,
		SAUCE: 12,
		ICE_COLORS: 13,
		USE_9PX_FONT: 14,
		CHANGE_FONT: 15,
		SET_CANVAS_SIZE: 16,
		PASTE_AS_SELECTION: 17,
		ROTATE: 18,
		FLIP_X: 19,
		FLIP_Y: 20,
		SET_BG: 21,
		CHANGE_PALETTE: 22
	}));
	Object.freeze({
		ACTIVE: 0,
		IDLE: 1,
		AWAY: 2,
		WEB: 3
	});
	var s = class extends Error {};
	const o = (e, t = {}) => JSON.stringify({
		type: e,
		data: t
	}), c = Object.freeze({
		EXT_DRAW: 23,
		EXT_DRAW_BATCH: 24,
		EXT_SYNC: 25,
		EXT_PALETTE: 26,
		EXT_ACK: 27,
		EXT_TIMELAPSE: 28
	});
	a.DRAW, a.SET_CANVAS_SIZE, c.EXT_DRAW, c.EXT_DRAW_BATCH;
	let d = null, i = -1, E = !1;
	const l = (e) => {
		if ("string" == typeof e && (e.startsWith("ws://") || e.startsWith("wss://"))) return e;
		const t = "https:" === self.location.protocol ? "wss:" : "ws:", r = self.location.port || ("https:" === self.location.protocol ? "443" : "80");
		return `${t}//${self.location.hostname}:${r}/server`;
	}, f = (e) => self.postMessage(e), p = () => {
		if (d) {
			try {
				d.close();
			} catch {}
			d = null;
		}
		E = !1, i = -1;
	}, y = (e) => {
		let t;
		p();
		try {
			t = new WebSocket(l(e.url));
		} catch (r) {
			f({
				cmd: "error",
				error: String(r)
			});
			return;
		}
		d = t, t.addEventListener("open", () => {
			t.send(o(a.CONNECTED, {
				nick: e.nick,
				group: e.group ?? "",
				pass: e.pass ?? "",
				caps: e.caps
			}));
		}), t.addEventListener("message", (e) => {
			if (d !== t) return;
			let r;
			try {
				r = ((e) => {
					let t = e;
					if ("string" == typeof e) try {
						t = JSON.parse(e);
					} catch {
						throw new s("frame is not JSON");
					}
					if ("object" != typeof t || null === t || Array.isArray(t)) throw new s("frame is not an object");
					const r = t;
					if (!Number.isInteger(r.type) || r.type < 0) throw new s(`bad frame type ${String(r.type)}`);
					const n = "object" != typeof r.data || null === r.data || Array.isArray(r.data) ? {} : r.data;
					return {
						type: r.type,
						data: n
					};
				})(e.data);
			} catch {
				return;
			}
			E ? f({
				cmd: "frame",
				type: r.type,
				data: r.data
			}) : r.type === a.CONNECTED ? (E = !0, i = "number" == typeof r.data.id ? r.data.id : -1, f({
				cmd: "connected",
				id: i,
				data: r.data
			})) : r.type === a.REFUSED && (f({ cmd: "refused" }), p());
		}), t.addEventListener("close", () => {
			if (d !== t) return;
			const e = E;
			E = !1, d = null, f({
				cmd: "closed",
				wasConnected: e
			});
		}), t.addEventListener("error", () => {
			d === t && f({
				cmd: "error",
				error: "websocket error"
			});
		});
	}, A = (e, t) => {
		if (d && E) try {
			d.send(o(e, {
				...t,
				id: i
			}));
		} catch {}
	};
	self.onmessage = (e) => {
		if (!((e) => (!e.origin || e.origin === self.location.origin) && "object" == typeof e.data && null !== e.data)(e) || "string" != typeof e.data.cmd) return;
		const t = e.data;
		switch (t.cmd) {
			case "init":
				f({ cmd: "initialized" });
				break;
			case "probe":
				((e) => {
					let t;
					try {
						t = new WebSocket(l(e));
					} catch {
						f({
							cmd: "probeResult",
							found: !1
						});
						return;
					}
					let r = !1;
					const n = (e) => {
						r || (r = !0, f({
							cmd: "probeResult",
							found: e
						}));
						try {
							t.close();
						} catch {}
					};
					t.addEventListener("open", () => {
						t.send(o(a.CONNECTED, {}));
					}), t.addEventListener("message", () => n(!0)), t.addEventListener("error", () => n(!1)), t.addEventListener("close", () => n(!1)), setTimeout(() => n(!1), 4e3);
				})(t.url);
				break;
			case "connect":
				y(t);
				break;
			case "send":
				Number.isInteger(t.type) && A(t.type, t.data ?? {});
				break;
			case "draw":
				if (Array.isArray(t.cells)) for (const e of t.cells) A(a.DRAW, e);
				break;
			case "disconnect": p();
		}
	};
})();
