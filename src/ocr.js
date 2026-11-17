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

  // Photo -> upright, greyscale canvas no bigger than 2400px (Tesseract does its own thresholding)
  async function prep(file) {
    let img;
    try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {
      img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This photo format can’t be read. Try a JPEG or PNG.')); i.src = URL.createObjectURL(file); });
    }
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    const k = Math.min(1, 2400 / Math.max(w0, h0));
    const cv = document.createElement('canvas');
    cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, cv.width, cv.height);
    const d = g.getImageData(0, 0, cv.width, cv.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const y = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0; p[i] = p[i + 1] = p[i + 2] = y; }
    g.putImageData(d, 0, 0);
    return cv;
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
  function fromLayout(data) {
    const paras = (data.paragraphs || []).map(p => (p.lines || []).filter(l => l.bbox && l.text && l.text.trim())).filter(ls => ls.length);
    const all = paras.flat();
    if (all.length < 2) return null;
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

  async function read(files, onProgress) {
    const pages = [];
    onProgress && onProgress(0, 'Loading the page scanner…');
    const w = await worker();
    for (let i = 0; i < files.length; i++) {
      if (Progress.cancelled) throw new Error('Cancelled');
      const label = files.length > 1 ? `page ${i + 1} of ${files.length}` : 'the page';
      onProgress && onProgress(i / files.length, `Preparing ${label}…`);
      const cv = await prep(files[i]);
      onLog = m => { if (m.status === 'recognizing text' && onProgress) onProgress((i + m.progress) / files.length, `Reading ${label}… ${Math.round(m.progress * 100)}%`); };
      const { data } = await w.recognize(cv, { rotateAuto: true });
      onLog = null;
      pages.push({ text: clean(fromLayout(data) || data.text), conf: data.confidence || 0 });
    }
    return pages;
  }
  return { read, clean, prep };
})();

/* Scan flow: pick/take photos -> read -> editable review sheet -> onUse(text) */
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
    Progress.open(files.length > 1 ? `Scanning ${files.length} pages` : 'Scanning page');
    try {
      const pages = await OCR.read(files, (f, m) => Progress.set(f, m));
      Progress.close();
      const text = pages.map(p => p.text).filter(Boolean).join('\n\n');
      const conf = pages.reduce((a, p) => a + p.conf, 0) / pages.length;
      review([existing, text].filter(Boolean).join('\n\n'), conf, onUse, !text);
    } catch (e) {
      Progress.close();
      if (e.message === 'Cancelled') { toast('Scan stopped.'); if (existing) review(existing, null, onUse); return; }
      ask('Couldn’t scan', esc(e.message || e), [{ label: 'OK', primary: true }]);
    }
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
