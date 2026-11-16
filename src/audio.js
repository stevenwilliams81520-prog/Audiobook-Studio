/* ===== Storage (IndexedDB) ===== */
const DB = (() => {
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('audiobook-studio', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function run(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      let out;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Storage aborted (device storage full?)'));
    });
  }
  return {
    get: (s, k) => run(s, 'readonly', st => st.get(k)),
    put: (s, v) => run(s, 'readwrite', st => st.put(v)),
    del: (s, k) => run(s, 'readwrite', st => st.delete(k)),
    all: s => run(s, 'readonly', st => st.getAll()),
    keys: s => run(s, 'readonly', st => st.getAllKeys()),
  };
})();

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ===== Audio library: clips' audio stored as Int16 per channel at the project sample rate ===== */
const AudioLib = (() => {
  const cache = new Map(); // id -> {sr, ch: Float32Array[], len, peaks}
  let cachedSamples = 0;
  const LIMIT = 30e6;

  function f32ToI16(f) {
    const o = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) { const s = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i]; o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    return o;
  }
  function i16ToF32(a) {
    const o = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) o[i] = a[i] / 32768;
    return o;
  }
  function remember(id, rec) {
    if (cache.has(id)) return;
    cache.set(id, rec);
    cachedSamples += rec.len * rec.ch.length;
    for (const [k, v] of cache) {
      if (cachedSamples <= LIMIT || k === id) break;
      cache.delete(k); cachedSamples -= v.len * v.ch.length;
    }
  }
  function peaks(ch, sr) {
    const per = Math.max(1, Math.round(sr / 100)); // 100 peaks per second
    const n = Math.ceil(ch[0].length / per);
    const p = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = 0; const e = Math.min(ch[0].length, (i + 1) * per);
      for (let c = 0; c < ch.length; c++) { const a = ch[c]; for (let j = i * per; j < e; j += 2) { const v = a[j] < 0 ? -a[j] : a[j]; if (v > m) m = v; } }
      p[i] = m;
    }
    return p;
  }
  async function save(ch, sr) {
    const id = 'a_' + uid();
    await DB.put('audio', { id, sr, len: ch[0].length, ch: ch.map(f32ToI16) });
    remember(id, { sr, ch, len: ch[0].length, peaks: peaks(ch, sr) });
    return id;
  }
  async function load(id) {
    if (cache.has(id)) { const v = cache.get(id); cache.delete(id); cache.set(id, v); return v; }
    const r = await DB.get('audio', id);
    if (!r) throw new Error('Missing audio for a clip — try regenerating it.');
    const ch = r.ch.map(i16ToF32);
    const rec = { sr: r.sr, ch, len: r.len, peaks: peaks(ch, r.sr) };
    remember(id, rec);
    return rec;
  }
  const peek = id => cache.get(id) || null;
  async function remove(id) { cache.delete(id); try { await DB.del('audio', id); } catch {} }
  return { save, load, peek, remove };
})();

/* ===== Helpers ===== */
async function resampleChannels(ch, fromSr, toSr, outChannels) {
  if (fromSr === toSr && ch.length === (outChannels || ch.length)) return ch;
  const len = Math.ceil(ch[0].length * toSr / fromSr);
  const nCh = outChannels || ch.length;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(nCh, len, toSr);
  const buf = ctx.createBuffer(ch.length, ch[0].length, fromSr);
  ch.forEach((d, i) => buf.copyToChannel ? buf.copyToChannel(d, i) : buf.getChannelData(i).set(d));
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
  const out = await ctx.startRendering();
  return Array.from({ length: nCh }, (_, i) => new Float32Array(out.getChannelData(i)));
}

async function decodeFileTo(file, sr) {
  const bytes = await file.arrayBuffer();
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, 1, sr);
  const buf = await new Promise((res, rej) => {
    const p = ctx.decodeAudioData(bytes, res, rej);
    if (p && p.then) p.then(res, rej);
  });
  let ch = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, i) => new Float32Array(buf.getChannelData(i)));
  if (buf.sampleRate !== sr) ch = await resampleChannels(ch, buf.sampleRate, sr);
  return ch;
}

/* ===== Mixer ===== */
const Mixer = (() => {
  function envAt(c, t) {
    let g = c.gain == null ? 1 : c.gain;
    if (c.fadeIn > 0 && t < c.fadeIn) g *= Math.max(0, t / c.fadeIn);
    if (c.fadeOut > 0 && t > c.dur - c.fadeOut) g *= Math.max(0, (c.dur - t) / c.fadeOut);
    return g;
  }
  function audibleTracks(chapter) {
    const solo = chapter.tracks.some(t => t.solo);
    const map = new Map();
    for (const t of chapter.tracks) if (!t.mute && (!solo || t.solo)) map.set(t.id, t);
    return map;
  }
  function chapterLength(chapter) {
    let e = 0;
    for (const c of chapter.clips) e = Math.max(e, c.start + c.dur);
    return e;
  }
  /** Calls onBlock(Float32Array[] channels) in order for the whole chapter (plus tailSec of silence). */
  async function renderChapter(project, chapter, tailSec, onBlock, onProgress, isCancelled) {
    const sr = project.sampleRate, C = project.channels;
    const tracks = audibleTracks(chapter);
    const clips = chapter.clips.filter(c => tracks.has(c.trackId) && c.audioId && c.status === 'ready');
    const total = Math.ceil((chapterLength(chapter) + (tailSec || 0)) * sr);
    const W = sr * 10;
    for (let w0 = 0; w0 < total; w0 += W) {
      if (isCancelled && isCancelled()) throw new Error('Cancelled');
      const n = Math.min(W, total - w0);
      const out = Array.from({ length: C }, () => new Float32Array(n));
      for (const c of clips) {
        const s = Math.round(c.start * sr), L = Math.round(c.dur * sr);
        if (s >= w0 + n || s + L <= w0) continue;
        const a = await AudioLib.load(c.audioId);
        const off = Math.round((c.offset || 0) * sr);
        const tg = tracks.get(c.trackId).gain == null ? 1 : tracks.get(c.trackId).gain;
        const i0 = Math.max(w0, s), i1 = Math.min(w0 + n, s + L);
        const fiEnd = s + Math.round((c.fadeIn || 0) * sr), foStart = s + L - Math.round((c.fadeOut || 0) * sr);
        const base = (c.gain == null ? 1 : c.gain) * tg;
        for (let i = i0; i < i1; i++) {
          const si = off + (i - s);
          if (si < 0 || si >= a.len) continue;
          let g = base;
          if (i < fiEnd || i >= foStart) g = envAt(c, (i - s) / sr) * tg;
          const o = i - w0;
          if (a.ch.length === 1) { const v = a.ch[0][si] * g; for (let k = 0; k < C; k++) out[k][o] += v; }
          else if (C === 1) out[0][o] += (a.ch[0][si] + a.ch[1][si]) * 0.5 * g;
          else { out[0][o] += a.ch[0][si] * g; out[1][o] += a.ch[1][si] * g; }
        }
      }
      // soft limit
      for (const ch of out) for (let i = 0; i < ch.length; i++) { const v = ch[i]; if (v > 0.98 || v < -0.98) ch[i] = Math.tanh(v); }
      await onBlock(out);
      if (onProgress) onProgress((w0 + n) / total);
      await new Promise(r => setTimeout(r, 0));
    }
    return total;
  }
  return { renderChapter, chapterLength, envAt, audibleTracks };
})();

/* ===== Encoders ===== */
const Encoders = (() => {
  function toI16(f) {
    const o = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) { const s = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i]; o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    return o;
  }

  function wav(sr, C) {
    const parts = []; let frames = 0;
    return {
      async write(ch) {
        const n = ch[0].length, b = new Int16Array(n * C);
        for (let k = 0; k < C; k++) { const s = toI16(ch[k]); for (let i = 0; i < n; i++) b[i * C + k] = s[i]; }
        parts.push(b); frames += n;
      },
      async finish() {
        const dataLen = frames * C * 2, h = new DataView(new ArrayBuffer(44));
        const w = (o, s) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); h.setUint32(4, 36 + dataLen, true); w(8, 'WAVE'); w(12, 'fmt ');
        h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, C, true); h.setUint32(24, sr, true);
        h.setUint32(28, sr * C * 2, true); h.setUint16(32, C * 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, dataLen, true);
        return new Blob([h.buffer, ...parts], { type: 'audio/wav' });
      }
    };
  }

  /* ID3v2.3 with title/artist/cover and CHAP/CTOC chapter frames */
  function id3(meta, chapters, totalMs) {
    const te = new TextEncoder();
    const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    const frame = (id, body) => { const b = body instanceof Uint8Array ? body : new Uint8Array(body); return new Uint8Array([...te.encode(id), ...u32(b.length), 0, 0, ...b]); };
    const textFrame = (id, s) => {
      // UTF-16 with BOM for full Unicode (Welsh accents etc.)
      const bytes = [1, 0xff, 0xfe];
      for (const c of String(s)) { const code = c.codePointAt(0); if (code > 0xffff) { const v = code - 0x10000; const hi = 0xd800 + (v >> 10), lo = 0xdc00 + (v & 0x3ff); bytes.push(hi & 255, hi >> 8, lo & 255, lo >> 8); } else bytes.push(code & 255, code >> 8); }
      return frame(id, bytes);
    };
    const catU8 = arr => { let n = 0; arr.forEach(a => n += a.length); const o = new Uint8Array(n); let p = 0; arr.forEach(a => { o.set(a, p); p += a.length; }); return o; };
    const frames = [];
    if (meta.title) frames.push(textFrame('TIT2', meta.title), textFrame('TALB', meta.album || meta.title));
    if (meta.artist) frames.push(textFrame('TPE1', meta.artist));
    if (meta.narrator) frames.push(textFrame('TCOM', meta.narrator));
    frames.push(textFrame('TCON', meta.genre || 'Audiobook'));
    if (meta.cover && meta.cover.bytes) {
      const mime = te.encode(meta.cover.type === 'png' ? 'image/png' : 'image/jpeg');
      frames.push(frame('APIC', catU8([new Uint8Array([0]), mime, new Uint8Array([0, 3, 0]), meta.cover.bytes])));
    }
    if (chapters && chapters.length) {
      const ids = chapters.map((c, i) => 'ch' + i);
      const ctoc = catU8([te.encode('toc'), new Uint8Array([0, 0x03, ids.length]), ...ids.map(id => catU8([te.encode(id), new Uint8Array([0])]))]);
      frames.push(frame('CTOC', ctoc));
      chapters.forEach((c, i) => {
        const s = Math.round(c.start * 1000), e = i + 1 < chapters.length ? Math.round(chapters[i + 1].start * 1000) : totalMs;
        const sub = textFrame('TIT2', c.title);
        frames.push(frame('CHAP', catU8([te.encode(ids[i]), new Uint8Array([0, ...u32(s), ...u32(e), 255, 255, 255, 255, 255, 255, 255, 255]), sub])));
      });
    }
    const body = catU8(frames);
    const sz = body.length;
    const syncsafe = [(sz >> 21) & 127, (sz >> 14) & 127, (sz >> 7) & 127, sz & 127];
    return catU8([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, ...syncsafe]), body]);
  }

  function mp3(sr, C, kbps) {
    if (!window.lamejs) throw new Error('MP3 encoder failed to load.');
    const enc = new lamejs.Mp3Encoder(C, sr, kbps);
    const parts = []; let frames = 0;
    return {
      async write(ch) {
        const L = toI16(ch[0]), R = C > 1 ? toI16(ch[1]) : null;
        for (let i = 0; i < L.length; i += 1152) {
          const b = C > 1 ? enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)) : enc.encodeBuffer(L.subarray(i, i + 1152));
          if (b.length) parts.push(new Uint8Array(b));
        }
        frames += L.length;
      },
      async finish(meta, chapters) {
        const e = enc.flush(); if (e.length) parts.push(new Uint8Array(e));
        const tag = id3(meta || {}, chapters, Math.round(frames / sr * 1000));
        return new Blob([tag, ...parts], { type: 'audio/mpeg' });
      }
    };
  }

  async function aacSupported(sr, C, bitrate) {
    if (!window.AudioEncoder) return false;
    try { const r = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: C, bitrate }); return !!r.supported; }
    catch { return false; }
  }

  function aac(sr, C, kbps, brand) {
    const bitrate = kbps * 1000;
    const packets = []; let asc = null, err = null, ts = 0, enc;
    const ready = (async () => {
      if (!(await aacSupported(sr, C, bitrate))) throw new Error('This device can’t encode AAC (M4A/M4B needs iOS 26 / Safari 26 or later, or Chrome on Windows/Mac). Use MP3 instead.');
      enc = new AudioEncoder({
        output: (chunk, md) => {
          const d = md && md.decoderConfig && md.decoderConfig.description;
          if (d && !asc) asc = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice() : new Uint8Array(d).slice();
          const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); packets.push(b);
        },
        error: e => { err = e; }
      });
      enc.configure({ codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: C, bitrate });
    })();
    return {
      async write(ch) {
        await ready; if (err) throw err;
        const n = ch[0].length; if (!n) return;
        const data = new Float32Array(n * C);
        for (let k = 0; k < C; k++) data.set(ch[k], k * n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: C, timestamp: Math.round(ts / sr * 1e6), data });
        enc.encode(ad); ad.close(); ts += n;
        while (enc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 5));
      },
      async finish(meta, chapters) {
        await ready; await enc.flush(); enc.close(); if (err) throw err;
        // strip ADTS headers if the encoder emitted them
        const clean = packets.map(p => (p[0] === 0xff && (p[1] & 0xf0) === 0xf0) ? p.subarray((p[1] & 1) ? 7 : 9) : p);
        return MP4.build({ sampleRate: sr, channels: C, bitrate, asc, packets: clean, chapters, meta, brand });
      }
    };
  }

  return { wav, mp3, aac, aacSupported, id3 };
})();
