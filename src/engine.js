/* ===== Voice engines =====
 * native : Capacitor plugin "KokoroTTS" (sherpa-onnx, Phase 2). Contract:
 *          load() -> { sampleRate, voices: string[] }
 *          synthesize({ text, voice, speed }) -> { sampleRate, pcm16: base64 Int16 little-endian mono }
 * web    : kokoro-js in the web view (works today in Safari / Apps Script; slower)
 * mock   : test tones, for development without a model
 */
const VOICES = [
  ['bm_george', 'George', 'British male'], ['bm_lewis', 'Lewis', 'British male'], ['bm_daniel', 'Daniel', 'British male'], ['bm_fable', 'Fable', 'British male'],
  ['bf_emma', 'Emma', 'British female'], ['bf_isabella', 'Isabella', 'British female'], ['bf_alice', 'Alice', 'British female'], ['bf_lily', 'Lily', 'British female'],
  ['am_michael', 'Michael', 'American male'], ['am_adam', 'Adam', 'American male'], ['am_fenrir', 'Fenrir', 'American male'], ['am_puck', 'Puck', 'American male'],
  ['am_echo', 'Echo', 'American male'], ['am_eric', 'Eric', 'American male'], ['am_liam', 'Liam', 'American male'], ['am_onyx', 'Onyx', 'American male'],
  ['af_heart', 'Heart', 'American female'], ['af_bella', 'Bella', 'American female'], ['af_nicole', 'Nicole', 'American female'], ['af_sarah', 'Sarah', 'American female'],
  ['af_sky', 'Sky', 'American female'], ['af_nova', 'Nova', 'American female'], ['af_river', 'River', 'American female'], ['af_kore', 'Kore', 'American female'],
  ['af_alloy', 'Alloy', 'American female'], ['af_aoede', 'Aoede', 'American female'], ['af_jessica', 'Jessica', 'American female'],
];
const voiceName = id => (VOICES.find(v => v[0] === id) || [id, id])[1];

function chunkText(text, maxLen = 280) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?;:]+[.!?;:]+["'’”)\]]*\s*|[^.!?;:]+$/g) || [clean];
  const out = []; let buf = '';
  const push = s => { s = s.trim(); if (s) out.push(s); };
  for (let s of sentences) {
    s = s.trim(); if (!s) continue;
    if (s.length > maxLen) {
      push(buf); buf = '';
      let w = '';
      for (const word of s.split(' ')) { if ((w + ' ' + word).length > maxLen) { push(w); w = word; } else w = (w + ' ' + word).trim(); }
      push(w);
    } else if ((buf + ' ' + s).trim().length > maxLen) { push(buf); buf = s; }
    else buf = (buf + ' ' + s).trim();
  }
  push(buf);
  return out;
}

const Engine = (() => {
  let kind = null, impl = null, loading = null;
  const forced = new URLSearchParams(location.search).get('engine');
  const nativePlugin = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.KokoroTTS;

  function pick(pref) {
    if (forced) return forced;
    if (pref && pref !== 'auto') return pref;
    return nativePlugin() ? 'native' : 'web';
  }

  const engines = {
    native: {
      label: 'On-device (native)',
      async load() { const r = await nativePlugin().load(); return r; },
      async synth(text, voice, speed) {
        const r = await nativePlugin().synthesize({ text, voice, speed });
        const bin = atob(r.pcm16), n = bin.length >> 1, f = new Float32Array(n);
        for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; f[i] = v / 32768; }
        return { sr: r.sampleRate, data: f };
      }
    },
    web: {
      label: 'In-app (web)',
      tts: null,
      async load(onProgress) {
        const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js');
        const files = {};
        this.tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'q8', device: 'wasm',
          progress_callback: p => {
            if (p.status === 'progress' && p.total) {
              files[p.file] = [p.loaded, p.total];
              let l = 0, t = 0; for (const [a, b] of Object.values(files)) { l += a; t += b; }
              onProgress && onProgress(l / t, `Downloading voice model ${(l / 1048576).toFixed(0)} / ${(t / 1048576).toFixed(0)} MB`);
            }
          }
        });
        return { sampleRate: 24000 };
      },
      async synth(text, voice, speed) {
        const parts = []; let n = 0;
        for (const c of chunkText(text)) {
          const a = await this.tts.generate(c, { voice, speed });
          parts.push(a.audio); n += a.audio.length;
          const gap = new Float32Array(Math.round(0.12 * 24000)); parts.push(gap); n += gap.length;
        }
        const f = new Float32Array(n); let o = 0; for (const p of parts) { f.set(p, o); o += p.length; }
        return { sr: 24000, data: f };
      }
    },
    mock: {
      label: 'Test tones',
      async load() { return { sampleRate: 24000 }; },
      async synth(text, voice, speed) {
        const sr = 24000, words = text.split(/\s+/).filter(Boolean);
        const base = 110 + (voice.charCodeAt(3) % 12) * 15 + (voice[1] === 'f' ? 90 : 0);
        const parts = [];
        for (const w of words) {
          const len = Math.round(sr * (0.09 + w.length * 0.035) / speed), f = new Float32Array(len + Math.round(sr * 0.06 / speed));
          for (let i = 0; i < len; i++) f[i] = 0.3 * Math.sin(2 * Math.PI * (base + 20 * Math.sin(i / 900)) * i / sr) * Math.sin(Math.PI * i / len);
          parts.push(f);
        }
        let n = 0; parts.forEach(p => n += p.length);
        const out = new Float32Array(Math.max(n, 1)); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
        await new Promise(r => setTimeout(r, 20));
        return { sr, data: out };
      }
    }
  };

  return {
    get kind() { return kind; },
    label(k) { return (engines[k || kind] || {}).label || ''; },
    available() { return { native: !!nativePlugin(), web: true, mock: true }; },
    async ensure(pref, onProgress) {
      const k = pick(pref);
      if (kind === k && impl) return impl;
      if (loading && loading.k === k) return loading.p;
      const e = engines[k] || engines.web;
      loading = { k, p: (async () => { await e.load(onProgress); kind = k; impl = e; loading = null; return e; })() };
      try { return await loading.p; } catch (err) { loading = null; throw err; }
    },
    async synth(pref, text, voice, speed, onProgress) {
      const e = await this.ensure(pref, onProgress);
      return e.synth(text, voice, speed);
    }
  };
})();
