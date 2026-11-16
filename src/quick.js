/* ===== Quick speech (home page): text -> one audio file ===== */
const Quick = (() => {
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('abs_quick') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('abs_quick', JSON.stringify(v)); } catch {} }
  };
  const st = Object.assign({ text: '', voice: 'bm_george', speed: 1, fmt: 'mp3', bitrate: 96, name: '', engine: 'auto', open: true }, store.get());
  let result = null; // { blob, url, name, secs }
  const persist = () => store.set({ text: st.text, voice: st.voice, speed: st.speed, fmt: st.fmt, bitrate: st.bitrate, name: st.name, engine: st.engine, open: st.open });
  const QFMT = { mp3: 'MP3', m4a: 'M4A (AAC)', wav: 'WAV' };

  function html() {
    return `<div class="card" id="quick">
      <h2 style="display:flex;justify-content:space-between;align-items:center;margin:0">Quick speech
        <button class="btn sm" data-q="toggle">${st.open ? 'Hide' : 'Show'}</button></h2>
      <div class="${st.open ? '' : 'hidden'}">
        <p class="small muted" style="margin:6px 0 0">Type or paste text and turn it into one audio file. For books with chapters and several voices, use a project below.</p>
        <textarea id="q-text" style="margin-top:10px;min-height:150px" placeholder="Type or paste text…">${esc(st.text)}</textarea>
        <div class="small muted" id="q-count" style="text-align:right">${st.text.length.toLocaleString()} characters</div>
        <div class="row2">
          <div><label class="f">Voice</label><select id="q-voice">${voiceOptions(st.voice)}</select></div>
          <div><label class="f">Format</label><select id="q-fmt">${Object.entries(QFMT).map(([k, l]) => `<option value="${k}" ${st.fmt === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <label class="f">Speed <span class="rangev" id="q-sv">${Number(st.speed).toFixed(2)}×</span></label>
        <input type="range" id="q-speed" min="0.6" max="1.5" step="0.05" value="${st.speed}">
        <div class="row2">
          <div><label class="f">File name</label><input type="text" id="q-name" value="${esc(st.name)}" placeholder="speech"></div>
          <div><label class="f">Quality</label><select id="q-br" ${st.fmt === 'wav' ? 'disabled' : ''}>${[64, 96, 128].map(b => `<option value="${b}" ${st.bitrate === b ? 'selected' : ''}>${b} kbps</option>`).join('')}</select></div>
        </div>
        <div class="btns full"><button class="btn sm" data-q="hear">Hear voice</button><button class="btn p" data-q="make" style="flex:2">Create audio</button></div>
        <div id="q-result">${resultHtml()}</div>
      </div>
    </div>`;
  }
  function resultHtml() {
    if (!result) return '';
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
      <div class="small muted"><b style="color:var(--ink)">${esc(result.name)}</b> · ${fmtLong(result.secs)} · ${(result.blob.size / 1024 / 1024).toFixed(2)} MB</div>
      <audio controls playsinline src="${result.url}" style="width:100%;margin-top:8px"></audio>
      <div class="btns full"><button class="btn p" data-q="save">Save / Share</button><button class="btn" data-q="toproject">Make into project</button></div>
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
    q('q-fmt').onchange = e => { st.fmt = e.target.value; q('q-br').disabled = st.fmt === 'wav'; persist(); };
  }

  async function onClick(e, root) {
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
      const t0 = performance.now(); let done = 0, frames = 0;
      const total = pieces.reduce((a, p) => a + p.text.length, 0);
      for (let i = 0; i < pieces.length; i++) {
        if (Progress.cancelled) throw new Error('Cancelled');
        const el = (performance.now() - t0) / 1000, eta = done ? el / done * (total - done) : 0;
        Progress.set(i / pieces.length, `Speaking part ${i + 1} of ${pieces.length}${eta > 5 ? ` · about ${fmtLong(eta)} left` : ''}`);
        const r = await Engine.synth(st.engine, pieces[i].text, st.voice, st.speed);
        const [data] = await resampleChannels([r.data], r.sr, sr, 1);
        const gap = new Float32Array(Math.round(pieces[i].gap * sr));
        await enc.write([data]); await enc.write([gap]);
        frames += data.length + gap.length; done += pieces[i].text.length;
      }
      Progress.set(1, 'Finishing file…');
      const name = safeName(st.name.trim() || text.slice(0, 40)) + '.' + st.fmt;
      const blob = await enc.finish({ title: st.name.trim() || text.slice(0, 60), artist: voiceName(st.voice), genre: 'Speech' }, null);
      if (result) URL.revokeObjectURL(result.url);
      result = { blob, url: URL.createObjectURL(blob), name, secs: frames / sr };
      window.__lastQuick = result;
      Progress.close();
      const r = $('#q-result', root); if (r) r.innerHTML = resultHtml();
      toast(`Created ${fmtLong(result.secs)} of audio.`);
    } catch (e) {
      Progress.close();
      if (e.message !== 'Cancelled') ask('Couldn’t create audio', esc(e.message || e), [{ label: 'OK', primary: true }]); else toast('Stopped.');
    }
  }

  return { html, bind, onClick };
})();
