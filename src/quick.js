/* ===== Quick speech (home page): text -> one audio file ===== */
const Quick = (() => {
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('abs_quick') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('abs_quick', JSON.stringify(v)); } catch {} }
  };
  const st = Object.assign({ text: '', voice: 'bm_george', speed: 1, fmt: 'mp3', bitrate: 96, name: '', engine: 'auto', open: true, follow: true, capMode: '' }, store.get());
  if (!st.capMode) st.capMode = st.follow === false ? 'off' : 'text';
  let result = null; // { blob, url, name, secs }
  const persist = () => store.set({ text: st.text, voice: st.voice, speed: st.speed, fmt: st.fmt, bitrate: st.bitrate, name: st.name, engine: st.engine, open: st.open, capMode: st.capMode });
  const QFMT = { mp3: 'MP3', m4a: 'M4A', wav: 'WAV' };

  function html() {
    return `<div class="card" id="quick">
      <h2 style="display:flex;justify-content:space-between;align-items:center;margin:0">Quick speech
        <button class="btn sm" data-q="toggle">${st.open ? 'Hide' : 'Show'}</button></h2>
      <div class="${st.open ? '' : 'hidden'}">
        <p class="small muted" style="margin:6px 0 0">Type or paste text and turn it into one audio file. For books with chapters and several voices, use a project below.</p>
        <textarea id="q-text" style="margin-top:10px;min-height:150px" placeholder="Type or paste text…">${esc(st.text)}</textarea>
        <div class="small muted" id="q-count" style="text-align:right">${st.text.length.toLocaleString()} characters</div>
        <div class="group">
          <label class="qrow"><span>Voice</span><select id="q-voice" class="gsel">${voiceOptions(st.voice)}</select></label>
          <label class="qrow"><span>Speed</span><input type="range" id="q-speed" min="0.6" max="1.5" step="0.05" value="${st.speed}"><span class="gval" id="q-sv">${Number(st.speed).toFixed(2)}×</span></label>
          <label class="qrow"><span>File name</span><input type="text" id="q-name" class="gin" value="${esc(st.name)}" placeholder="speech"></label>
          <label class="qrow"><span>Quality</span><select id="q-br" class="gsel" ${st.fmt === 'wav' ? 'disabled' : ''}>${[64, 96, 128].map(b => `<option value="${b}" ${st.bitrate === b ? 'selected' : ''}>${b} kbps</option>`).join('')}</select></label>
        </div>
        <div class="seg" role="radiogroup" aria-label="Format">${Object.entries(QFMT).map(([k, l]) => `<button type="button" role="radio" aria-checked="${st.fmt === k}" class="${st.fmt === k ? 'on' : ''}" data-qf="${k}">${l}</button>`).join('')}</div>
        <div class="btns full"><button class="btn sm" data-q="hear">Hear voice</button><button class="btn p" data-q="make" style="flex:2">Create audio</button></div>
        <div id="q-result">${resultHtml()}</div>
      </div>
    </div>`;
  }
  function resultHtml() {
    if (!result) return '';
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
      <div class="small muted"><b style="color:var(--ink)">${esc(result.name)}</b> · ${fmtLong(result.secs)} · ${(result.blob.size / 1024 / 1024).toFixed(2)} MB</div>
      <audio controls playsinline src="${result.url}" id="q-audio" style="width:100%;margin-top:8px"></audio>
      <div class="seg cap-seg" role="radiogroup" aria-label="Show words while playing">${[['off', 'No words'], ['text', 'Text'], ['rsvp', 'Speed reader']].map(([k, l]) => `<button type="button" role="radio" data-qc="${k}" aria-checked="${st.capMode === k}" class="${st.capMode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="captions ${st.capMode === 'text' ? '' : 'hidden'}" id="q-cap" aria-live="off">${Captions.html(result.segs)}</div>
      <div class="rsvp-box ${st.capMode === 'rsvp' ? '' : 'hidden'}" id="q-rsvp">${Captions.rsvpHtml()}</div>
      <div class="btns full"><button class="btn p" data-q="save">Save / Share</button><button class="btn" data-q="toproject">Make into project</button></div>
      <div class="btns full"><button class="btn sm" data-q="srt">Save words (.srt)</button></div>
    </div>`;
  }

  function bind(root) {
    const q = id => $('#' + id, root);
    if (!q('q-text')) return;
    q('q-text').oninput = e => { st.text = e.target.value; q('q-count').textContent = st.text.length.toLocaleString() + ' characters'; persist(); };
    q('q-voice').onchange = e => { st.voice = e.target.value; persist(); };
    q('q-speed').oninput = e => { st.speed = Number(e.target.value); q('q-sv').textContent = st.speed.toFixed(2) + '×'; persist(); };
    q('q-name').oninput = e => { st.name = e.target.value; persist(); };
    q('q-br').onchange = e => { st.bitrate = Number(e.target.value); persist(); };
    attachCaptions(root);
  }
  function attachCaptions(root) {
    const a = $('#q-audio', root), box = $('#q-cap', root), rb = $('#q-rsvp', root);
    if (!a || !box) return;
    const list = Captions.flat(result.segs);
    let raf = 0;
    const show = () => {
      if (st.capMode === 'text') Captions.highlight(box, a.currentTime);
      else if (st.capMode === 'rsvp') Captions.rsvp(rb, list, a.currentTime, 0, a.duration || result.secs);
    };
    const loop = () => { show(); if (!a.paused) raf = requestAnimationFrame(loop); };
    a.onplay = () => { cancelAnimationFrame(raf); loop(); };
    a.onseeked = a.ontimeupdate = show;
    box.onclick = e => { const w = e.target.closest('.cw'); if (w) { a.currentTime = +w.dataset.s + 0.001; show(); } };
    rb.onclick = () => { if (a.paused) a.play().catch(() => {}); else a.pause(); };
    show();
  }

  async function onClick(e, root) {
    const f = e.target.closest('[data-qf]');
    if (f) {
      st.fmt = f.dataset.qf; persist();
      root.querySelectorAll('[data-qf]').forEach(x => { const on = x.dataset.qf === st.fmt; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      const br = $('#q-br', root); if (br) br.disabled = st.fmt === 'wav';
      return true;
    }
    const qc = e.target.closest('[data-qc]');
    if (qc) {
      st.capMode = qc.dataset.qc; persist();
      root.querySelectorAll('[data-qc]').forEach(x => { const on = x.dataset.qc === st.capMode; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      $('#q-cap', root).classList.toggle('hidden', st.capMode !== 'text');
      $('#q-rsvp', root).classList.toggle('hidden', st.capMode !== 'rsvp');
      const a = $('#q-audio', root); if (a) a.ontimeupdate && a.ontimeupdate();
      return true;
    }
    const b = e.target.closest('[data-q]'); if (!b) return false;
    switch (b.dataset.q) {
      case 'toggle': st.open = !st.open; persist(); render(); break;
      case 'hear': {
        b.disabled = true; const old = b.textContent;
        try {
          await Engine.ensure(st.engine, f => { b.textContent = Math.round(f * 100) + '%'; });
          b.textContent = 'Speaking…';
          const r = await Engine.synth(st.engine, `Hello, this is ${voiceName(st.voice)}.`, st.voice, st.speed);
          await Player.playRaw([r.data], r.sr);
        } catch (err) { ask('Voice engine problem', esc(err.message || err), [{ label: 'OK', primary: true }]); }
        b.disabled = false; b.textContent = old; break;
      }
      case 'make': await make(root); break;
      case 'srt': if (result) await deliver([{ blob: new Blob([Captions.srt(result.segs)], { type: 'text/plain' }), name: result.name.replace(/\.[^.]+$/, '.srt') }], 'text/plain'); break;
      case 'save': if (result) await deliver([{ blob: result.blob, name: result.name }], result.blob.type); break;
      case 'toproject': {
        const p = newProject(st.name.trim() || 'Quick speech');
        p.cast[0].voice = st.voice; p.cast[0].speed = st.speed;
        p.chapters[0].script = st.text;
        await DB.put('projects', p);
        await openProject(p.id, 'script');
        toast('Project created — tap “Build timeline” to lay it out.');
        break;
      }
    }
    return true;
  }

  async function make(root) {
    const text = st.text.trim();
    if (!text) return toast('Type some text first.');
    const paras = text.replace(/\r/g, '').split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    const pieces = paras.map((p, i) => chunkText(p).map((c, j, arr) => ({ text: c, gap: j === arr.length - 1 ? (i === paras.length - 1 ? 0.4 : 0.7) : 0.12 }))).flat();
    const sr = 24000;
    Progress.open('Creating audio');
    try {
      if (st.fmt === 'm4a' && !(await Encoders.aacSupported(sr, 1, st.bitrate * 1000))) throw new Error('This iPhone can’t make M4A files (needs iOS 26 or later). Choose MP3 instead.');
      await Engine.ensure(st.engine, (f, m) => Progress.set(f, m));
      const enc = st.fmt === 'wav' ? Encoders.wav(sr, 1) : st.fmt === 'mp3' ? Encoders.mp3(sr, 1, st.bitrate) : Encoders.aac(sr, 1, st.bitrate, 'M4A ');
      const t0 = performance.now(); let done = 0, frames = 0; const segs = [];
      const total = pieces.reduce((a, p) => a + p.text.length, 0);
      for (let i = 0; i < pieces.length; i++) {
        if (Progress.cancelled) throw new Error('Cancelled');
        const el = (performance.now() - t0) / 1000, eta = done ? el / done * (total - done) : 0;
        Progress.set(i / pieces.length, `Speaking part ${i + 1} of ${pieces.length}${eta > 5 ? ` · about ${fmtLong(eta)} left` : ''}`);
        const r = await Engine.synth(st.engine, pieces[i].text, st.voice, st.speed);
        const [data] = await resampleChannels([r.data], r.sr, sr, 1);
        const gap = new Float32Array(Math.round(pieces[i].gap * sr));
        const [vs, ve] = Captions.speechBounds(data, sr);
        segs.push({ text: pieces[i].text, s: frames / sr + vs, e: frames / sr + ve });
        await enc.write([data]); await enc.write([gap]);
        frames += data.length + gap.length; done += pieces[i].text.length;
      }
      Progress.set(1, 'Finishing file…');
      const name = safeName(st.name.trim() || text.slice(0, 40)) + '.' + st.fmt;
      const blob = await enc.finish({ title: st.name.trim() || text.slice(0, 60), artist: voiceName(st.voice), genre: 'Speech' }, null);
      if (result) URL.revokeObjectURL(result.url);
      result = { blob, url: URL.createObjectURL(blob), name, secs: frames / sr, segs };
      window.__lastQuick = result;
      Progress.close();
      const r = $('#q-result', root); if (r) { r.innerHTML = resultHtml(); attachCaptions(root); }
      toast(`Created ${fmtLong(result.secs)} of audio.`);
    } catch (e) {
      Progress.close();
      if (e.message !== 'Cancelled') ask('Couldn’t create audio', esc(e.message || e), [{ label: 'OK', primary: true }]); else toast('Stopped.');
    }
  }

  return { html, bind, onClick };
})();
