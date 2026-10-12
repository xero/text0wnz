(function() {
	const e = ["journal.a", "journal.b"];
	let t = null, n = null, r = 0, a = null;
	const o = async (e) => {
		if (!t) throw new Error("journal worker not initialized");
		return (await t.getFileHandle(e, { create: !0 })).createSyncAccessHandle();
	}, s = () => {
		if (!a) throw new Error("journal file is closed");
		return a;
	}, i = {
		read: async () => ((e) => {
			const t = e.getSize(), n = new Uint8Array(t);
			return t > 0 && e.read(n, { at: 0 }), n;
		})(s()),
		append: async (e) => {
			if (!e) throw new Error("append needs bytes");
			const t = s();
			return t.write(e, { at: t.getSize() }), t.flush(), null;
		},
		rewrite: async (t) => {
			if (!t) throw new Error("rewrite needs bytes");
			const i = 0 === r ? 1 : 0, l = await o(e[i]);
			l.truncate(0), l.write(t, { at: 0 }), l.flush(), ((e) => {
				if (!n) throw new Error("journal worker not initialized");
				const t = Uint8Array.of(1 === e ? 1 : 0);
				n.truncate(0), n.write(t, { at: 0 }), n.flush(), r = e;
			})(i);
			const c = s();
			return a = l, c.truncate(0), c.flush(), c.close(), null;
		},
		wipe: async () => {
			const e = s();
			return e.truncate(0), e.flush(), null;
		},
		close: async () => (a?.close(), n?.close(), a = null, n = null, null)
	};
	let l = null;
	self.onmessage = async (s) => {
		if (!((e) => (!e.origin || e.origin === self.location.origin) && "object" == typeof e.data && null !== e.data)(s) || "string" != typeof s.data.op) return;
		const { id: c, op: u, bytes: w } = s.data;
		try {
			l || (l = (async () => {
				t = await navigator.storage.getDirectory(), n = await o("journal.meta");
				const s = /* @__PURE__ */ new Uint8Array(1);
				n.getSize() > 0 && n.read(s, { at: 0 }), r = 1 === s[0] ? 1 : 0, a = await o(e[r]);
			})()), await l;
			const s = i[u];
			if (!s) throw new Error(`unknown journal op ${u}`);
			const f = await s(w);
			f instanceof Uint8Array ? self.postMessage({
				id: c,
				ok: !0,
				bytes: f
			}, [f.buffer]) : self.postMessage({
				id: c,
				ok: !0
			});
		} catch (f) {
			self.postMessage({
				id: c,
				ok: !1,
				error: String(f && f.message || f)
			});
		}
	};
})();
