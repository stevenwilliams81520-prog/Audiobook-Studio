/* ===== Scan a page: photo -> text (Tesseract.js, runs on the device) ===== */
const OCR = (() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let workerP = null, onLog = null;

  function loadLib() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = LIB; s.onload = res;
      s.onerror = () => rej(new Error('Couldn’t load the page scanner. Check your internet connection and try again.'));
      document.head.appendChild(s);
    });
  }
  function worker() {
    if (!workerP) workerP = (async () => {
      await loadLib();
      return Tesseract.createWorker('eng', 1, { logger: m => onLog && onLog(m) });
    })().catch(e => { workerP = null; throw e; });
    return workerP;
  }

  // Any photo file -> upright canvas at full resolution (capped at 4000px)
  async function loadImage(file) {
    let img;
    try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {
      img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This photo format can’t be read. Try a JPEG or PNG.')); i.src = URL.createObjectURL(file); });
    }
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    const k = Math.min(1, 4000 / Math.max(w0, h0));
    const cv = document.createElement('canvas');
    cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }
  function rotate90(src) {
    const cv = document.createElement('canvas');
    cv.width = src.height; cv.height = src.width;
    const g = cv.getContext('2d');
    g.translate(cv.width, 0); g.rotate(Math.PI / 2); g.drawImage(src, 0, 0);
    return cv;
  }
  // Cut out the chosen area and size it so the text is a comfortable height for the reader
  function crop(src, r) {
    const w = Math.max(8, Math.round(r.w)), h = Math.max(8, Math.round(r.h));
    const big = Math.max(w, h);
    const k = big < 1800 ? Math.min(3, 1800 / big) : big > 2600 ? 2600 / big : 1;
    const color = document.createElement('canvas');
    color.width = Math.round(w * k); color.height = Math.round(h * k);
    const g = color.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, r.x, r.y, w, h, 0, 0, color.width, color.height);
    const grey = document.createElement('canvas');
    grey.width = color.width; grey.height = color.height;
    const gg = grey.getContext('2d', { willReadFrequently: true });
    gg.drawImage(color, 0, 0);
    const d = gg.getImageData(0, 0, grey.width, grey.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const y = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0; p[i] = p[i + 1] = p[i + 2] = y; }
    gg.putImageData(d, 0, 0);
    return { color, grey };
  }
  // Local (adaptive) threshold: copes with shadows and uneven light across a page
  function threshold(grey) {
    const W = grey.width, H = grey.height;
    const g = grey.getContext('2d', { willReadFrequently: true });
    const src = g.getImageData(0, 0, W, H), p = src.data;
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += p[(y * W + x) * 4]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
    const r = Math.max(8, Math.round(Math.min(W, H) / 32));
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const og = out.getContext('2d'); const od = og.createImageData(W, H), q = od.data;
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const sum = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0)), i = (y * W + x) * 4;
        const v = p[i] < mean * 0.88 ? 0 : 255;
        q[i] = q[i + 1] = q[i + 2] = v; q[i + 3] = 255;
      }
    }
    og.putImageData(od, 0, 0);
    return out;
  }
  async function recognize(cv, onProgress, label) {
    const w = await worker();
    onLog = m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress, `${label}… ${Math.round(m.progress * 100)}%`); };
    try { const { data } = await w.recognize(cv, { rotateAuto: true }); return data; } finally { onLog = null; }
  }
  // Read the shadow-proof version first (best on real photos); if unsure, also try the plain
  // greyscale version and keep whichever the reader is more confident about
  async function recognizeBest(grey, onProgress) {
    onProgress && onProgress(0, 'Loading the page scanner…');
    await worker();
    const a = await recognize(threshold(grey), f => onProgress && onProgress(f * 0.5, null), 'Reading text');
    if ((a.confidence || 0) >= 85) return a;
    onProgress && onProgress(0.5, 'Having another look…');
    const b = await recognize(grey, f => onProgress && onProgress(0.5 + f * 0.5, null), 'Having another look');
    return (b.confidence || 0) > (a.confidence || 0) ? b : a;
  }

  // Tidy OCR text: join wrapped lines into paragraphs, mend hyphenated words, drop page numbers
  function clean(text) {
    const paras = String(text || '').replace(/\r/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
      .split(/\n\s*\n+/);
    const out = [];
    for (const para of paras) {
      const lines = para.split('\n').map(l => l.trim()).filter(l => l && !/^[\divxlc\s.\-–—|]{1,6}$/i.test(l));
      let s = '';
      for (const l of lines) {
        if (!s) s = l;
        else if (/[A-Za-z]-$/.test(s) && /^[a-z]/.test(l)) s = s.slice(0, -1) + l;
        else s += ' ' + l;
      }
      s = s.replace(/\s+([,.;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
      if (s) out.push(s);
    }
    return out.join('\n\n');
  }

  // Rebuild text keeping Tesseract's paragraphs (found from indents), and also start a new
  // paragraph wherever the gap between two lines is clearly bigger than the page's normal spacing
  function fromLayout(paras) {
    paras = paras.map(ls => ls.filter(l => l.bbox && l.text && l.text.trim())).filter(ls => ls.length);
    const all = paras.flat();
    if (!all.length) return '';
    const gaps = [];
    for (let i = 1; i < all.length; i++) { const g = all[i].bbox.y0 - all[i - 1].bbox.y1; if (g > -5) gaps.push(g); }
    gaps.sort((a, b) => a - b);
    const hs = all.map(l => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b);
    const normal = gaps.length ? gaps[gaps.length >> 1] : 0, mh = hs[hs.length >> 1] || 20;
    const out = [];
    let prev = null;
    for (const ls of paras) {
      let cur = '';
      for (const l of ls) {
        const s = l.text.replace(/\s*\n\s*/g, ' ').trim();
        if (prev && cur && l.bbox.y0 - prev.bbox.y1 > normal + mh * 0.6) { out.push(cur); cur = ''; }
        cur += (cur ? '\n' : '') + s; prev = l;
      }
      if (cur) out.push(cur);
    }
    return out.join('\n\n');
  }
  // Flatten Tesseract's result into words that know their paragraph and line
  function wordsOf(data) {
    const out = [];
    (data.paragraphs || []).forEach((p, pi) => (p.lines || []).forEach((l, li) => (l.words || []).forEach(w => {
      const t = (w.text || '').replace(/^[|\u00a6]+|[|\u00a6]+$/g, '').trim();
      if (!/[\p{L}\p{N}]/u.test(t) && !/^["'\u2014\u2013-]+$/.test(t)) return;
      if (t && w.bbox) out.push({ t, b: w.bbox, c: w.confidence || 0, p: pi, l: pi * 10000 + li });
    })));
    return out;
  }
  // Text from a chosen set of words, laid out like the page
  function textOf(words) {
    const paras = [];
    let curP = null, curL = null, line = null;
    for (const w of words) {
      if (w.p !== curP) { paras.push([]); curP = w.p; curL = null; }
      if (w.l !== curL) { line = { text: '', bbox: { x0: w.b.x0, y0: w.b.y0, x1: w.b.x1, y1: w.b.y1 } }; paras[paras.length - 1].push(line); curL = w.l; }
      line.text += (line.text ? ' ' : '') + w.t;
      line.bbox.y0 = Math.min(line.bbox.y0, w.b.y0); line.bbox.y1 = Math.max(line.bbox.y1, w.b.y1); line.bbox.x1 = Math.max(line.bbox.x1, w.b.x1);
    }
    return clean(fromLayout(paras));
  }
  return { loadImage, rotate90, crop, threshold, recognizeBest, clean, wordsOf, textOf };
})();

/* ===== Scan screens: select the area, then choose the words ===== */
const ScanView = (() => {
  let el = null;
  function open() {
    if (!el) { el = document.createElement('div'); el.id = 'scanview'; document.body.appendChild(el); }
    el.classList.remove('hidden');
    return el;
  }
  function close() { if (el) { el.classList.add('hidden'); el.innerHTML = ''; } }
  function fit(stage, w, h) {
    const sw = stage.clientWidth, sh = stage.clientHeight, s = Math.min(sw / w, sh / h);
    return { s, ox: (sw - w * s) / 2, oy: (sh - h * s) / 2, dw: w * s, dh: h * s };
  }
  function show(stage, src, f) {
    const cv = stage.querySelector('canvas.sv-img') || stage.appendChild(Object.assign(document.createElement('canvas'), { className: 'sv-img' }));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(f.dw * dpr); cv.height = Math.round(f.dh * dpr);
    Object.assign(cv.style, { left: f.ox + 'px', top: f.oy + 'px', width: f.dw + 'px', height: f.dh + 'px' });
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, cv.width, cv.height);
  }

  /* Screen 1: drag a box around the text. Resolves {color, grey} | null (cancel) */
  function selectArea(srcIn, label) {
    return new Promise(resolve => {
      let src = srcIn;
      const v = open();
      v.innerHTML = `<div class="sv-top"><button class="btn sm sv-dark" data-v="cancel">Cancel</button><h2>Select the text${label ? ` <span class="sv-sub">${esc(label)}</span>` : ''}</h2><button class="ib sv-dark" data-v="rot" aria-label="Rotate photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg></button></div>
        <div class="sv-stage" id="sv-stage"><div class="sv-sel" id="sv-sel"><i class="sv-h" data-c="tl"></i><i class="sv-h" data-c="tr"></i><i class="sv-h" data-c="bl"></i><i class="sv-h" data-c="br"></i></div></div>
        <p class="sv-hint">Drag the corners so the box covers only the words you want read. Leave out headings, pictures and the opposite page.</p>
        <div class="sv-bot"><button class="btn sv-dark" data-v="all">Whole photo</button><button class="btn p" data-v="go" style="flex:2">Read this area</button></div>`;
      const stage = $('#sv-stage', v), sel = $('#sv-sel', v);
      let f, r;
      const layout = (reset) => {
        f = fit(stage, src.width, src.height); show(stage, src, f);
        if (reset || !r) r = { x: f.ox + f.dw * 0.06, y: f.oy + f.dh * 0.06, w: f.dw * 0.88, h: f.dh * 0.88 };
        draw();
      };
      const draw = () => Object.assign(sel.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      const clampR = () => {
        const minS = 40;
        r.w = Math.max(minS, Math.min(r.w, f.dw)); r.h = Math.max(minS, Math.min(r.h, f.dh));
        r.x = Math.min(Math.max(r.x, f.ox), f.ox + f.dw - r.w); r.y = Math.min(Math.max(r.y, f.oy), f.oy + f.dh - r.h);
      };
      requestAnimationFrame(() => layout(true));
      const onResize = () => layout(true);
      window.addEventListener('resize', onResize);
      let drag = null;
      stage.onpointerdown = e => {
        const b = stage.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
        const h = e.target.closest('.sv-h');
        const corner = h ? h.dataset.c : null;
        const inside = x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
        drag = { corner, mode: corner ? 'corner' : inside ? 'move' : 'new', x, y, r0: { ...r } };
        stage.setPointerCapture(e.pointerId); e.preventDefault();
      };
      stage.onpointermove = e => {
        if (!drag) return;
        const b = stage.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - b.left, f.ox), f.ox + f.dw), y = Math.min(Math.max(e.clientY - b.top, f.oy), f.oy + f.dh);
        const o = drag.r0, dx = x - drag.x, dy = y - drag.y;
        if (drag.mode === 'move') r = { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h };
        else if (drag.mode === 'new') r = { x: Math.min(drag.x, x), y: Math.min(drag.y, y), w: Math.abs(x - drag.x), h: Math.abs(y - drag.y) };
        else {
          let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
          if (drag.corner.includes('l')) x0 = Math.min(x, x1 - 40); else x1 = Math.max(x, x0 + 40);
          if (drag.corner.includes('t')) y0 = Math.min(y, y1 - 40); else y1 = Math.max(y, y0 + 40);
          r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
        clampR(); draw();
      };
      stage.onpointerup = stage.onpointercancel = () => { drag = null; };
      const done = val => { window.removeEventListener('resize', onResize); resolve(val); };
      v.onclick = e => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        if (b.dataset.v === 'cancel') return done(null);
        if (b.dataset.v === 'rot') { src = OCR.rotate90(src); r = null; return layout(true); }
        const area = b.dataset.v === 'all' ? { x: 0, y: 0, w: src.width, h: src.height }
          : { x: (r.x - f.ox) / f.s, y: (r.y - f.oy) / f.s, w: r.w / f.s, h: r.h / f.s };
        done(OCR.crop(src, area));
      };
    });
  }

  /* Screen 2: tap or drag across words. Resolves text | 'back' | null */
  function chooseWords(color, data) {
    return new Promise(resolve => {
      const words = OCR.wordsOf(data);
      const on = words.map(() => true);
      // the reader straightens tilted photos around their centre; boxes come back in straightened coordinates
      const th = data.rotateRadians || 0;
      const v = open();
      v.innerHTML = `<div class="sv-top"><button class="btn sm sv-dark" data-v="back">Back</button><h2>Choose the words</h2><button class="btn sm sv-dark" data-v="toggle">Clear</button></div>
        <div class="sv-stage" id="sv-stage"><div class="sv-words" id="sv-words"></div></div>
        <p class="sv-hint">${words.length ? 'Tap a word to leave it out or put it back. Drag across words to choose just those. <span class="sv-low-key">Orange</span> = not sure, check it on the next screen.' : 'No words found here. Go back and try a smaller area, or retake the photo flat and well lit.'}</p>
        <div class="sv-bot"><button class="btn sv-dark" data-v="cancel">Cancel</button><button class="btn p" data-v="use" style="flex:2" ${words.length ? '' : 'disabled'}>Use <span id="sv-n">${words.length}</span> words</button></div>`;
      const stage = $('#sv-stage', v), wl = $('#sv-words', v);
      let f;
      const layout = () => {
        f = fit(stage, color.width, color.height); show(stage, color, f);
        const cx = color.width / 2, cy = color.height / 2;
        wl.style.transformOrigin = `${f.ox + cx * f.s}px ${f.oy + cy * f.s}px`;
        wl.style.transform = th ? `rotate(${-th}rad)` : '';
        wl.innerHTML = words.map((w, i) => `<i class="sv-w${on[i] ? '' : ' off'}${w.c < 60 ? ' low' : ''}" data-i="${i}" style="left:${f.ox + w.b.x0 * f.s - 2}px;top:${f.oy + w.b.y0 * f.s - 2}px;width:${(w.b.x1 - w.b.x0) * f.s + 4}px;height:${(w.b.y1 - w.b.y0) * f.s + 4}px"></i>`).join('');
      };
      const paint = () => {
        wl.querySelectorAll('.sv-w').forEach(n => n.classList.toggle('off', !on[+n.dataset.i]));
        const n = on.filter(Boolean).length;
        $('#sv-n', v).textContent = n; $('[data-v=use]', v).disabled = !n;
        $('[data-v=toggle]', v).textContent = n ? 'Clear' : 'Select all';
      };
      requestAnimationFrame(layout);
      const onResize = () => layout();
      window.addEventListener('resize', onResize);
      const hit = (cx, cy) => {
        const b = stage.getBoundingClientRect(), ux = (cx - b.left - f.ox) / f.s, uy = (cy - b.top - f.oy) / f.s;
        const mx = color.width / 2, my = color.height / 2, c = Math.cos(th), s = Math.sin(th);
        const x = (ux - mx) * c - (uy - my) * s + mx, y = (ux - mx) * s + (uy - my) * c + my;
        let best = -1, bd = 14 / f.s;
        words.forEach((w, i) => {
          const dx = Math.max(w.b.x0 - x, 0, x - w.b.x1), dy = Math.max(w.b.y0 - y, 0, y - w.b.y1), d = Math.hypot(dx, dy);
          if (d < bd) { bd = d; best = i; }
        });
        return best;
      };
      let drag = null;
      stage.onpointerdown = e => {
        const i = hit(e.clientX, e.clientY);
        drag = { a: i, last: i, moved: false };
        stage.setPointerCapture(e.pointerId); e.preventDefault();
      };
      stage.onpointermove = e => {
        if (!drag || drag.a < 0) return;
        const i = hit(e.clientX, e.clientY);
        if (i < 0 || i === drag.last) return;
        drag.last = i; drag.moved = true;
        const lo = Math.min(drag.a, i), hi = Math.max(drag.a, i);
        on.forEach((_, k) => { on[k] = k >= lo && k <= hi; });
        paint();
      };
      stage.onpointerup = () => {
        if (drag && !drag.moved && drag.a >= 0) { on[drag.a] = !on[drag.a]; paint(); }
        drag = null;
      };
      const done = val => { window.removeEventListener('resize', onResize); resolve(val); };
      v.onclick = e => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        if (b.dataset.v === 'back') return done('back');
        if (b.dataset.v === 'cancel') return done(null);
        if (b.dataset.v === 'toggle') { const any = on.some(Boolean); on.fill(!any); return paint(); }
        if (b.dataset.v === 'use') done({ text: OCR.textOf(words.filter((_, i) => on[i])), conf: data.confidence || 0 });
      };
    });
  }
  return { selectArea, chooseWords, close };
})();

/* Scan flow: take/pick photos -> select area -> choose words -> editable review -> onUse(text) */
const Scan = (() => {
  function pick(camera) {
    return new Promise(res => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      if (camera) inp.setAttribute('capture', 'environment'); else inp.multiple = true;
      inp.style.display = 'none';
      inp.onchange = () => { const f = [...inp.files]; inp.remove(); res(f); };
      inp.oncancel = () => { inp.remove(); res([]); };
      document.body.appendChild(inp);
      inp.click();
    });
  }
  async function start(camera, onUse, existing) {
    const files = await pick(camera);
    if (!files.length) return;
    if (existing != null) closeModal();
    const texts = []; let confs = [];
    for (let i = 0; i < files.length; i++) {
      const label = files.length > 1 ? `Photo ${i + 1} of ${files.length}` : '';
      let src;
      try { src = await OCR.loadImage(files[i]); }
      catch (e) { await ask('Couldn’t open photo', esc(e.message || e), [{ label: 'OK', primary: true }]); continue; }
      for (;;) {
        const area = await ScanView.selectArea(src, label);
        if (!area) { ScanView.close(); if (existing || texts.length) review([existing, ...texts].filter(Boolean).join('\n\n'), null, onUse); return; }
        Progress.open('Reading text');
        let data;
        try { data = await OCR.recognizeBest(area.grey, (f, m) => Progress.set(f, m)); }
        catch (e) {
          Progress.close(); ScanView.close();
          if (e.message !== 'Cancelled') ask('Couldn’t scan', esc(e.message || e), [{ label: 'OK', primary: true }]);
          return;
        }
        Progress.close();
        if (Progress.cancelled) { ScanView.close(); toast('Scan stopped.'); return; }
        const res = await ScanView.chooseWords(area.color, data);
        if (res === 'back') continue;
        if (!res) { ScanView.close(); if (existing || texts.length) review([existing, ...texts].filter(Boolean).join('\n\n'), null, onUse); return; }
        if (res.text) { texts.push(res.text); confs.push(res.conf); }
        break;
      }
    }
    ScanView.close();
    const text = [existing, ...texts].filter(Boolean).join('\n\n');
    const conf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
    review(text, conf, onUse, !texts.join('').trim() && !existing);
  }
  function review(text, conf, onUse, empty) {
    const warn = empty ? 'No text was found. Try a closer, brighter photo with the page flat and filling the frame.'
      : conf != null && conf < 70 ? 'Some words may be wrong. Check the text below, or retake the photo with the page flat and well lit.' : '';
    const el = openModal(`<h2>Scanned text</h2>
      <p class="small muted">Check and correct the text before it's turned into speech.</p>
      ${warn ? `<p class="small" style="color:var(--gold);margin-top:0">${warn}</p>` : ''}
      <textarea id="scan-txt" style="min-height:42vh">${esc(text)}</textarea>
      <div class="small muted" id="scan-n" style="text-align:right">${text.length.toLocaleString()} characters</div>
      <div class="btns full"><button class="btn" data-sc="more-cam">+ Scan another page</button><button class="btn" data-sc="more-lib">+ Photo</button></div>
      <div class="btns full"><button class="btn" data-sc="cancel">Cancel</button><button class="btn p" data-sc="use" style="flex:2">Use this text</button></div>`);
    const ta = $('#scan-txt', el);
    ta.oninput = () => { $('#scan-n', el).textContent = ta.value.length.toLocaleString() + ' characters'; };
    el.onclick = e => {
      const b = e.target.closest('[data-sc]'); if (!b) return;
      const cur = ta.value.trim();
      if (b.dataset.sc === 'cancel') return closeModal();
      if (b.dataset.sc === 'use') { closeModal(); if (cur) onUse(cur); return; }
      start(b.dataset.sc === 'more-cam', onUse, cur);
    };
  }
  return { start };
})();
