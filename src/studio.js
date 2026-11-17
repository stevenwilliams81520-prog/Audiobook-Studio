/* ===== Player (Web Audio) ===== */
const Player = (() => {
  let ctx = null, nodes = [], playing = false, t0 = 0, p0 = 0, raf = 0, bufs = new Map(), bufCh = null;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC();
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function toBuffer(rec) {
    const b = ctx.createBuffer(rec.ch.length, rec.len, rec.sr);
    rec.ch.forEach((d, i) => b.getChannelData(i).set(d));
    return b;
  }
  async function buffer(id) {
    if (bufs.has(id)) return bufs.get(id);
    const b = toBuffer(await AudioLib.load(id)); bufs.set(id, b); return b;
  }
  function stopNodes() { for (const n of nodes) { try { n.stop(); } catch {} try { n.disconnect(); } catch {} } nodes = []; }
  const pos = () => playing ? p0 + (ctx.currentTime - t0) : S.playhead;
  function tick() {
    if (!playing) return;
    const t = pos(), ch = chapter();
    S.playhead = t;
    Studio.updatePlayhead(true);
    if (!ch || t > Mixer.chapterLength(ch) + 0.3) { stop(); Studio.updateTransport(); return; }
    raf = requestAnimationFrame(tick);
  }
  async function play() {
    ensure();
    const ch = chapter();
    if (bufCh !== ch.id) { bufs = new Map(); bufCh = ch.id; }
    const tracks = Mixer.audibleTracks(ch);
    const clips = ch.clips.filter(c => tracks.has(c.trackId) && c.audioId && c.status !== 'pending' && c.status !== 'error' && c.start + c.dur > S.playhead);
    if (S.playhead >= Mixer.chapterLength(ch) - 0.05) S.playhead = 0;
    Studio.setBusy('Loading…');
    try { for (const c of clips) await buffer(c.audioId); } finally { Studio.setBusy(null); }
    stopNodes();
    const start = ctx.currentTime + 0.06, from = S.playhead;
    const tgNodes = new Map();
    for (const [id, t] of tracks) { const g = ctx.createGain(); g.gain.value = t.gain == null ? 1 : t.gain; g.connect(ctx.destination); tgNodes.set(id, g); nodes.push({ stop() {}, disconnect: () => g.disconnect() }); }
    for (const c of clips) {
      if (c.start + c.dur <= from) continue;
      const local = Math.max(0, from - c.start), when = start + Math.max(0, c.start - from);
      const src = ctx.createBufferSource(); src.buffer = bufs.get(c.audioId);
      const g = ctx.createGain();
      src.connect(g); g.connect(tgNodes.get(c.trackId));
      g.gain.setValueAtTime(Mixer.envAt(c, local), when);
      const pts = [c.fadeIn || 0, c.dur - (c.fadeOut || 0), c.dur].filter(x => x > local + 0.001).sort((a, b) => a - b);
      for (const pt of pts) g.gain.linearRampToValueAtTime(Mixer.envAt(c, Math.min(pt, c.dur - 0.0001)), when + (pt - local));
      const dur = Math.max(0.001, c.dur - local);
      src.start(when, (c.offset || 0) + local, dur);
      nodes.push(src);
    }
    t0 = start; p0 = from; playing = true;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function stop() {
    if (playing) S.playhead = pos();
    playing = false; cancelAnimationFrame(raf); stopNodes();
  }
  async function playRaw(ch, sr) {
    ensure(); stop();
    const b = ctx.createBuffer(ch.length, ch[0].length, sr); ch.forEach((d, i) => b.getChannelData(i).set(d));
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(); nodes.push(s);
    return new Promise(r => { s.onended = r; });
  }
  return { play, stop, playRaw, get playing() { return playing; }, pos, ensure, clearCache() { bufs = new Map(); } };
})();

/* ===== Studio (multi-track timeline) ===== */
const Studio = (() => {
  let root = null;
  const HDRW = 104;
  const xOf = t => HDRW + t * S.pps;
  const laneLen = ch => Math.max(60, Mixer.chapterLength(ch) + 30);

  function render(main) {
    root = main;
    const ch = chapter();
    const tts = ch.clips.filter(c => c.kind === 'tts');
    const need = tts.filter(c => c.status !== 'ready' && !c.cut).length;
    main.innerHTML = `
      <div class="transport">
        <div class="t-row t-main">
          <button class="ib" data-t="start" aria-label="To start">${ICON.start}</button>
          <button class="ib p" data-t="play" aria-label="Play">${Player.playing ? ICON.pause : ICON.play}</button>
          <span class="time ptime">${fmtT(S.playhead)}</span>
          <span class="sep"></span>
          <button class="ib" data-t="zout" aria-label="Zoom out">${ICON.zout}</button>
          <button class="ib" data-t="zin" aria-label="Zoom in">${ICON.zin}</button>
          <span class="sep"></span>
          <button class="ib" data-t="undo" ${S.undo.length ? '' : 'disabled'} aria-label="Undo">${ICON.undo}</button>
          <button class="ib" data-t="redo" ${S.redo.length ? '' : 'disabled'} aria-label="Redo">${ICON.redo}</button>
        </div>
        <div class="t-row t-acts">
          <button class="btn sm" data-t="gen" ${need ? '' : 'disabled'}>${ICON.wand.replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px"')} Generate${need ? ` (${need})` : ''}</button>
          <button class="btn sm" data-t="split">${ICON.cut.replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px"')} Split</button>
          <button class="btn sm" data-t="addtrack">+ Track</button>
          <button class="btn sm cc-btn ${S.cc ? 'on' : ''}" data-t="cc" aria-pressed="${S.cc}" aria-label="Show words while playing">CC</button>
          <label class="btn sm">${ICON.music.replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px"')} Import<input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac" id="impfile" hidden multiple></label>
        </div>
        <span id="busy" class="small muted"></span>
      </div>
      <div class="tl" id="tl"></div>
      <div class="ccbar ${S.cc ? '' : 'hidden'}" id="cc"></div>
      <div class="insp" id="insp"></div>
      <div class="dock">
        <span class="time ptime">${fmtT(S.playhead)}</span>
        <div class="dbtns">
          <button class="ib" data-t="start" aria-label="To start">${ICON.start}</button>
          <button class="ib" data-t="undo" ${S.undo.length ? '' : 'disabled'} aria-label="Undo">${ICON.undo}</button>
          <button class="ib p big" data-t="play" aria-label="Play">${Player.playing ? ICON.pause : ICON.play}</button>
          <button class="ib" data-t="redo" ${S.redo.length ? '' : 'disabled'} aria-label="Redo">${ICON.redo}</button>
          <button class="ib" data-t="zout" aria-label="Zoom out">${ICON.zout}</button>
          <button class="ib" data-t="zin" aria-label="Zoom in">${ICON.zin}</button>
        </div>
      </div>`;
    main.onclick = onTransport;
    $('#cc').onclick = e => { const w = e.target.closest('.cw'); if (!w) return; e.stopPropagation(); const was = Player.playing; Player.stop(); S.playhead = +w.dataset.s + 0.001; updatePlayhead(true); if (was) Player.play().then(updateTransport); };
    ccKey = null;
    $('#impfile').onchange = e => importAudio([...e.target.files]);
    renderTimeline();
    renderInspector();
    bindPointer($('#tl'));
    updateCaptions();
  }

  function renderTimeline() {
    const tl = root && root.isConnected && $('#tl', root); if (!tl) return;
    const ch = chapter(), len = laneLen(ch), W = HDRW + len * S.pps;
    const sl = tl.scrollLeft, st = tl.scrollTop;
    const step = S.pps >= 80 ? 1 : S.pps >= 30 ? 5 : S.pps >= 10 ? 15 : S.pps >= 3 ? 60 : 300;
    let ticks = '';
    for (let t = 0; t <= len; t += step) ticks += `<div class="tick" style="left:${t * S.pps}px">${fmtT(t).replace(/\.0$/, '')}</div>`;
    const rows = ch.tracks.map(t => {
      const clips = ch.clips.filter(c => c.trackId === t.id).map(c => clipHtml(c, t)).join('');
      return `<div class="trow" data-track="${t.id}">
        <div class="hdr ${S.selTrack === t.id ? 'sel' : ''}" style="--c:${t.color}" data-hdr="${t.id}">
          <span class="tn">${esc(t.name)}</span>
          <span class="tb"><button class="m ${t.mute ? 'on' : ''}" data-mute="${t.id}">M</button><button class="s ${t.solo ? 'on' : ''}" data-solo="${t.id}">S</button></span>
        </div>
        <div class="lane" data-lane="${t.id}">${clips}</div></div>`;
    }).join('');
    tl.innerHTML = `<div class="tl-inner" style="width:${W}px">
      <div class="trow ruler-row"><div class="hdr" style="border-left-color:transparent"><span class="small muted">${fmtLong(Mixer.chapterLength(ch))}</span></div><div class="ruler" data-ruler="1">${ticks}</div></div>
      ${rows}
      <div class="playhead" id="ph" style="left:${xOf(S.playhead)}px"></div></div>`;
    tl.scrollLeft = sl; tl.scrollTop = st;
    drawWaves(tl);
  }

  function clipHtml(c, t) {
    const cls = ['clip', S.sel === c.id && 'sel', c.status === 'pending' && 'pending', c.status === 'stale' && 'stale', c.status === 'error' && 'err'].filter(Boolean).join(' ');
    const label = c.kind === 'tts' ? (c.status === 'error' ? '⚠ ' : '') + c.text : c.name || 'Audio';
    return `<div class="${cls}" data-clip="${c.id}" style="left:${c.start * S.pps}px;width:${Math.max(4, c.dur * S.pps)}px;--c:${t.color}"><canvas></canvas><span class="lbl">${esc(label.slice(0, 160))}</span><i class="h h-l" data-h="l"></i><i class="h h-r" data-h="r"></i></div>`;
  }

  function drawWaves(tl) {
    const ch = chapter();
    const color = getComputedStyle(document.documentElement).getPropertyValue('--wave').trim() || '#000';
    tl.querySelectorAll('.clip').forEach(async el => {
      const c = ch.clips.find(k => k.id === el.dataset.clip); if (!c || !c.audioId) return;
      let rec = AudioLib.peek(c.audioId);
      if (!rec) { try { rec = await AudioLib.load(c.audioId); } catch { return; } if (!el.isConnected) return; }
      const cv = el.querySelector('canvas'), w = Math.min(2048, Math.max(4, Math.round(c.dur * S.pps))), h = 54;
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.fillStyle = color; g.globalAlpha = 0.45;
      const p = rec.peaks, pps = 100, mid = h / 2 + 5;
      for (let x = 0; x < w; x++) {
        const t = (c.offset || 0) + x / w * c.dur;
        const i = Math.floor(t * pps); if (i >= p.length) break;
        const env = Mixer.envAt(c, x / w * c.dur);
        const a = Math.min(1, p[i] * env * 1.6) * (h / 2 - 8);
        g.fillRect(x, mid - a, 1, Math.max(1, a * 2));
      }
      // fade guides
      g.globalAlpha = 0.9; g.strokeStyle = color; g.lineWidth = 1.2; g.beginPath();
      const fx = (c.fadeIn || 0) / c.dur * w, fo = (c.fadeOut || 0) / c.dur * w;
      if (fx > 1) { g.moveTo(0, h); g.lineTo(fx, 12); }
      if (fo > 1) { g.moveTo(w - fo, 12); g.lineTo(w, h); }
      g.stroke();
    });
  }

  let ccKey = null;
  function updateCaptions() {
    const box = $('#cc'); if (!box || !S.cc) return;
    const ch = chapter(), t = S.playhead, tracks = Mixer.audibleTracks(ch);
    const tts = ch.clips.filter(c => c.kind === 'tts' && tracks.has(c.trackId) && c.audioId).sort((a, b) => a.start - b.start);
    let act = tts.filter(c => t >= c.start && t < c.start + c.dur);
    let upcoming = false;
    if (!act.length) { const nx = tts.find(c => c.start > t); if (nx) { act = [nx]; upcoming = true; } else { const pv = tts.filter(c => c.start + c.dur <= t).pop(); if (pv) act = [pv]; } }
    const key = act.map(c => c.id).join() + (upcoming ? '~' : '');
    if (key !== ccKey) {
      ccKey = key;
      box.classList.toggle('dim', upcoming);
      box.innerHTML = act.length ? Captions.html(act.map(c => {
        const g = c.genDur || (c.dur + (c.offset || 0)), base = c.start - (c.offset || 0);
        const tr = trackById(c.trackId), cast = castById(c.castId);
        return { text: c.text, s: base + (c.vs || 0), e: base + (c.ve || g), who: S.project.cast.length > 1 ? cast.name : '', color: tr && tr.color };
      })) : '<p class="cseg muted small">Words appear here while the chapter plays.</p>';
    }
    Captions.highlight(box, t);
  }
  function updatePlayhead(follow) {
    const ph = $('#ph');
    if (ph) ph.style.left = xOf(S.playhead) + 'px';
    document.querySelectorAll('.ptime').forEach(tm => { tm.textContent = fmtT(S.playhead); });
    if (follow) {
      const tl = $('#tl'); if (!tl) return;
      const x = xOf(S.playhead);
      if (x > tl.scrollLeft + tl.clientWidth - 40 || x < tl.scrollLeft + HDRW) tl.scrollLeft = x - HDRW - 20;
    }
    updateCaptions();
  }
  function updateTransport() { document.querySelectorAll('[data-t=play]').forEach(b => { b.innerHTML = Player.playing ? ICON.pause : ICON.play; b.setAttribute('aria-label', Player.playing ? 'Pause' : 'Play'); }); updatePlayhead(); }
  function setBusy(t) { const b = $('#busy'); if (b) b.textContent = t || ''; }

  /* ----- transport actions ----- */
  async function onTransport(e) {
    const mute = e.target.closest('[data-mute]'), solo = e.target.closest('[data-solo]');
    if (mute || solo) {
      const t = trackById((mute || solo).dataset.mute || (mute || solo).dataset.solo);
      const was = Player.playing; Player.stop();
      mutate(() => { if (mute) t.mute = !t.mute; else t.solo = !t.solo; }, { render: false, reflow: false });
      renderTimeline(); if (was) Player.play();
      return;
    }
    const hdr = e.target.closest('[data-hdr]');
    if (hdr && !e.target.closest('button')) { S.selTrack = hdr.dataset.hdr; S.sel = null; renderTimeline(); renderInspector(); return; }
    const b = e.target.closest('[data-t]'); if (!b) return;
    const ch = chapter();
    switch (b.dataset.t) {
      case 'play': if (Player.playing) Player.stop(); else await Player.play(); updateTransport(); break;
      case 'start': { const was = Player.playing; Player.stop(); S.playhead = 0; updatePlayhead(); const tl = $('#tl'); tl.scrollLeft = 0; if (was) { await Player.play(); } updateTransport(); break; }
      case 'zin': case 'zout': {
        const tl = $('#tl'), center = (tl.scrollLeft + tl.clientWidth / 2 - HDRW) / S.pps;
        S.pps = clamp(S.pps * (b.dataset.t === 'zin' ? 1.6 : 1 / 1.6), 1, 300);
        renderTimeline(); tl.scrollLeft = center * S.pps + HDRW - tl.clientWidth / 2; break;
      }
      case 'undo': Player.stop(); undo(); break;
      case 'redo': Player.stop(); redo(); break;
      case 'split': splitAtPlayhead(); break;
      case 'cc': {
        S.cc = !S.cc; try { localStorage.setItem('abs_cc', S.cc ? '1' : '0'); } catch {}
        b.classList.toggle('on', S.cc); b.setAttribute('aria-pressed', S.cc);
        $('#cc').classList.toggle('hidden', !S.cc); ccKey = null; updateCaptions(); break;
      }
      case 'gen': Player.stop(); await generate(ch.clips); break;
      case 'addtrack': {
        const kind = await ask('Add a track', 'Music and sound-effect tracks hold imported audio. Character tracks hold speech.', [{ label: 'Music / effects track', value: 'audio', primary: true }, { label: 'Character track', value: 'voice' }, { label: 'Cancel', value: null }]);
        if (kind === 'audio') { const n = await promptText('Track name', ch.tracks.some(t => t.kind === 'audio') ? 'Effects' : 'Music'); if (n) mutate(() => ch.tracks.push(newTrack(n, 'audio', null, ch.tracks.length))); }
        if (kind === 'voice') {
          const el = openModal(`<h2>Character track</h2><select id="ct">${S.project.cast.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><div class="btns full"><button class="btn" data-v="0">Cancel</button><button class="btn p" data-v="1">Add</button></div>`);
          el.onclick = ev => { const bb = ev.target.closest('[data-v]'); if (!bb) return; const id = $('#ct').value; closeModal(); if (bb.dataset.v === '1') mutate(() => { const t = newTrack(castById(id).name, 'voice', id, ch.tracks.length); t.color = castById(id).color; ch.tracks.push(t); }); };
        }
        break;
      }
    }
  }

  async function importAudio(files) {
    if (!files.length) return;
    const p = S.project, ch = chapter();
    Progress.open('Importing audio', false);
    try {
      let at = S.playhead;
      const added = [];
      for (let i = 0; i < files.length; i++) {
        Progress.set(i / files.length, files[i].name);
        const data = await decodeFileTo(files[i], p.sampleRate);
        const id = await AudioLib.save(data, p.sampleRate);
        added.push({ id, name: files[i].name.replace(/\.[^.]+$/, ''), dur: data[0].length / p.sampleRate });
      }
      mutate(() => {
        let tr = S.selTrack && trackById(S.selTrack);
        if (!tr || tr.kind !== 'audio') tr = ch.tracks.find(t => t.kind === 'audio');
        if (!tr) { tr = newTrack('Music', 'audio', null, ch.tracks.length); ch.tracks.push(tr); }
        for (const a of added) {
          const c = { id: 'k_' + uid(), trackId: tr.id, kind: 'file', name: a.name, audioId: a.id, srcDur: a.dur, start: at, dur: a.dur, offset: 0, gain: 0.8, fadeIn: 0, fadeOut: 0, seq: null, status: 'ready' };
          ch.clips.push(c); at += a.dur; S.sel = c.id;
        }
      });
      Progress.close();
      toast(`Imported ${added.length} file${added.length === 1 ? '' : 's'}.`);
    } catch (e) { Progress.close(); ask('Couldn’t import', esc(e.message || 'This audio format isn’t supported on this device.'), [{ label: 'OK', primary: true }]); }
  }

  function splitAtPlayhead() {
    const ch = chapter(), t = S.playhead;
    let targets = ch.clips.filter(c => t > c.start + 0.02 && t < c.start + c.dur - 0.02);
    if (S.sel) targets = targets.filter(c => c.id === S.sel).length ? targets.filter(c => c.id === S.sel) : targets;
    if (!targets.length) return toast('Move the playhead over a clip to split it.');
    mutate(() => {
      for (const c of targets) {
        const a = t - c.start;
        const c2 = Object.assign(JSON.parse(JSON.stringify(c)), { id: 'k_' + uid(), start: t, offset: (c.offset || 0) + a, dur: c.dur - a, fadeIn: 0 });
        c.dur = a; c.fadeOut = 0;
        if (c.kind === 'tts') { c.cut = c2.cut = true; }
        if (c.seq != null) { c2.seq = c.seq + 0.5; c2.gapAfter = c.gapAfter; c.gapAfter = 0; renumber(ch); }
        ch.clips.splice(ch.clips.indexOf(c) + 1, 0, c2);
        S.sel = c2.id;
      }
    });
  }
  function renumber(ch) { ch.clips.filter(c => c.seq != null).sort((a, b) => a.seq - b.seq).forEach((c, i) => { c.seq = i; }); }

  /* ----- pointer: move / trim / seek ----- */
  function bindPointer(tl) {
    let drag = null;
    tl.addEventListener('pointerdown', e => {
      if (e.target.closest('.hdr')) return;
      const clipEl = e.target.closest('.clip');
      const ch = chapter();
      if (clipEl) {
        const c = ch.clips.find(k => k.id === clipEl.dataset.clip);
        const handle = e.target.dataset.h && S.sel === c.id ? e.target.dataset.h : null;
        drag = { mode: handle ? 'trim-' + handle : 'move', c, el: clipEl, x0: e.clientX, y0: e.clientY, orig: { start: c.start, dur: c.dur, offset: c.offset || 0, trackId: c.trackId }, moved: false, id: e.pointerId };
        clipEl.setPointerCapture(e.pointerId);
      } else {
        drag = { mode: 'seek', x0: e.clientX, y0: e.clientY, moved: false, sl: tl.scrollLeft };
      }
    });
    tl.addEventListener('pointermove', e => {
      if (!drag || drag.mode === 'seek') { if (drag && (Math.abs(e.clientX - drag.x0) > 8 || Math.abs(e.clientY - drag.y0) > 8)) drag.moved = true; return; }
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.moved = true; e.preventDefault();
      const c = drag.c, o = drag.orig, dt = dx / S.pps;
      if (drag.mode === 'move') {
        c.start = snap(Math.max(0, o.start + dt), c);
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const lane = under && under.closest('[data-lane]');
        if (lane && lane.dataset.lane !== c.trackId) { c.trackId = lane.dataset.lane; lane.appendChild(drag.el); drag.el.style.setProperty('--c', trackById(c.trackId).color); }
      } else {
        const srcLen = sourceLen(c);
        if (drag.mode === 'trim-l') {
          const d = clamp(dt, -o.offset, o.dur - 0.05);
          c.offset = o.offset + d; c.start = o.start + d; c.dur = o.dur - d;
        } else {
          c.dur = clamp(o.dur + dt, 0.05, srcLen - o.offset);
        }
      }
      drag.el.style.left = c.start * S.pps + 'px'; drag.el.style.width = Math.max(4, c.dur * S.pps) + 'px';
    }, { passive: false });
    const end = e => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.mode === 'seek') {
        if (!d.moved && !e.target.closest('.hdr')) {
          const r = tl.getBoundingClientRect();
          const t = (e.clientX - r.left + tl.scrollLeft - HDRW) / S.pps;
          if (t >= 0) {
            const was = Player.playing; Player.stop(); S.playhead = t; updatePlayhead();
            if (S.sel || S.selTrack) { S.sel = null; S.selTrack = null; renderTimeline(); renderInspector(); }
            if (was) Player.play().then(updateTransport);
          }
        }
        return;
      }
      const c = d.c;
      if (!d.moved) { S.sel = c.id; S.selTrack = null; renderTimeline(); renderInspector(); return; }
      // commit: restore orig for undo snapshot, then apply
      const now = { start: c.start, dur: c.dur, offset: c.offset, trackId: c.trackId };
      Object.assign(c, d.orig);
      const ch = chapter();
      const movedSeq = d.mode === 'move' && c.seq != null && ch.autoFlow && Math.abs(now.start - d.orig.start) > 0.01;
      Player.stop(); updateTransport();
      mutate(() => {
        Object.assign(c, now);
        if (movedSeq) { ch.autoFlow = false; }
      });
      if (movedSeq) toast('Auto-arrange is off for this chapter — turn it back on in the clip panel.');
    };
    tl.addEventListener('pointerup', end);
    tl.addEventListener('pointercancel', e => { if (drag && drag.c) { Object.assign(drag.c, drag.orig); renderTimeline(); } drag = null; });
  }
  function sourceLen(c) {
    if (c.srcDur) return c.srcDur;
    const r = c.audioId && AudioLib.peek(c.audioId);
    return r ? r.len / S.project.sampleRate : c.dur + (c.offset || 0);
  }
  function snap(t, c) {
    const tol = 8 / S.pps;
    let best = t, bd = tol;
    const cand = [0, S.playhead];
    for (const k of chapter().clips) if (k !== c) cand.push(k.start, k.start + k.dur);
    for (const x of cand) { if (Math.abs(x - t) < bd) { bd = Math.abs(x - t); best = x; } if (Math.abs(x - (t + c.dur)) < bd) { bd = Math.abs(x - (t + c.dur)); best = x - c.dur; } }
    return Math.max(0, best);
  }

  /* ----- inspector ----- */
  function rng(label, k, v, min, max, step, fmt) {
    return `<label class="f">${label} <span class="rangev" id="rv-${k}">${fmt(v)}</span></label><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}">`;
  }
  const dB = g => g <= 0.001 ? '−∞ dB' : (20 * Math.log10(g)).toFixed(1) + ' dB';
  const sec = v => Number(v).toFixed(2) + ' s';

  function renderInspector() {
    const el = root && $('#insp', root); if (!el) return;
    const ch = chapter(), p = S.project;
    const c = S.sel && ch.clips.find(k => k.id === S.sel);
    const t = !c && S.selTrack && trackById(S.selTrack);
    if (c) {
      const tr = trackById(c.trackId), cast = c.castId && castById(c.castId);
      el.innerHTML = `
        <h3><span style="color:${tr.color}">●</span> ${c.kind === 'tts' ? `Speech · ${esc(cast.name)}` : esc(c.name || 'Audio')}
          <span class="pill ${c.status === 'ready' ? 'ok' : 'warn'}">${c.cut ? 'cut' : c.status === 'stale' ? 'voice changed' : c.status}</span></h3>
        ${c.status === 'error' ? `<p class="small" style="color:var(--danger)">${esc(c.error || 'Generation failed')}</p>` : ''}
        ${c.kind === 'tts' && !c.cut ? `<textarea data-k="text">${esc(c.text)}</textarea>
          <div class="grid"><div><label class="f">Voice</label><select data-k="castId">${p.cast.map(x => `<option value="${x.id}" ${x.id === c.castId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div><label class="f">&nbsp;</label><button class="btn" style="width:100%" data-i="regen">${c.status === 'ready' ? 'Regenerate' : 'Generate'}</button></div></div>`
        : c.kind === 'tts' ? `<p class="small muted">${esc(c.text.slice(0, 220))}${c.text.length > 220 ? '…' : ''}</p><p class="small muted">Split clips keep their audio but can't be regenerated. Rebuild the timeline from the Script tab to start fresh.</p>` : ''}
        <div class="grid">
          <div>${rng('Volume', 'gain', c.gain == null ? 1 : c.gain, 0, 2, 0.01, dB)}</div>
          <div><label class="f">Start</label><input type="number" step="0.1" min="0" data-k="start" value="${c.start.toFixed(2)}"></div>
          <div>${rng('Fade in', 'fadeIn', c.fadeIn || 0, 0, Math.min(15, c.dur / 2), 0.05, sec)}</div>
          <div>${rng('Fade out', 'fadeOut', c.fadeOut || 0, 0, Math.min(15, c.dur / 2), 0.05, sec)}</div>
          ${c.seq != null ? `<div>${rng('Pause after', 'gapAfter', c.gapAfter || 0, 0, 5, 0.05, sec)}</div>` : ''}
          <div><label class="f">Track</label><select data-k="trackId">${ch.tracks.map(x => `<option value="${x.id}" ${x.id === c.trackId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        </div>
        <p class="small muted" style="margin:8px 0 0">Length ${sec(c.dur)}${c.offset ? ` · trimmed ${sec(c.offset)} from start` : ''}. Drag the clip to move it; once selected, drag its edges to trim.</p>
        <div class="btns">
          <button class="btn sm" data-i="preview">Play clip</button>
          <button class="btn sm" data-i="split">Split at playhead</button>
          <button class="btn sm" data-i="dup">Duplicate</button>
          ${c.seq != null ? `<button class="btn sm" data-i="flow">${ch.autoFlow ? 'Auto-arrange: on' : 'Turn auto-arrange on'}</button>` : ''}
          <button class="btn sm d" data-i="del">Delete</button>
        </div>`;
    } else if (t) {
      el.innerHTML = `<h3><span style="color:${t.color}">●</span> Track · ${esc(t.name)}</h3>
        <div class="grid"><div><label class="f">Name</label><input type="text" data-k="tname" value="${esc(t.name)}"></div>
        <div>${rng('Track volume', 'tgain', t.gain == null ? 1 : t.gain, 0, 2, 0.01, dB)}</div></div>
        <div class="btns"><button class="btn sm d" data-i="tdel">Delete track</button></div>`;
    } else {
      const need = ch.clips.filter(k => k.kind === 'tts' && k.status !== 'ready' && !k.cut).length;
      el.innerHTML = `<p class="small muted" style="margin:0">${ch.clips.length ? `<b>${esc(ch.title)}</b> · ${ch.clips.length} clips · ${fmtLong(Mixer.chapterLength(ch))}${need ? ` · <b>${need} need audio</b>` : ''}. Tap a clip to edit it, tap the ruler or empty space to move the playhead, tap a track name for track settings.` : 'This chapter is empty. Write or paste text in the Script tab and tap “Build timeline”, or import music and sound effects with Import.'}</p>
        ${ch.clips.some(k => k.seq != null) ? `<div class="btns"><button class="btn sm" data-i="flow">${ch.autoFlow ? 'Auto-arrange narration: on' : 'Turn auto-arrange on'}</button></div>` : ''}`;
    }
    el.oninput = ev => {
      const k = ev.target.dataset.k, v = ev.target.value, rv = $('#rv-' + k);
      if (rv) rv.textContent = (['gain', 'tgain'].includes(k) ? dB : sec)(Number(v));
    };
    el.onchange = ev => {
      const k = ev.target.dataset.k; if (!k) return;
      const v = ev.target.value;
      Player.stop(); updateTransport();
      if (t) return mutate(() => { if (k === 'tname') t.name = v.trim() || t.name; if (k === 'tgain') t.gain = Number(v); });
      mutate(() => {
        if (k === 'text') { if (v.trim() && v !== c.text) { c.text = v.trim(); c.status = 'pending'; } }
        else if (k === 'castId') { c.castId = v; c.trackId = voiceTrackFor(ch, v).id; c.status = 'pending'; }
        else if (k === 'trackId') c.trackId = v;
        else if (k === 'start') { c.start = Math.max(0, Number(v) || 0); if (c.seq != null && ch.autoFlow) { ch.autoFlow = false; toast('Auto-arrange turned off for this chapter.'); } }
        else c[k] = Number(v);
      });
    };
    el.onclick = async ev => {
      const b = ev.target.closest('[data-i]'); if (!b) return;
      switch (b.dataset.i) {
        case 'regen': Player.stop(); c.status = c.status === 'ready' ? 'stale' : c.status; await generate([c], 'Generating clip'); break;
        case 'preview': {
          if (!c.audioId) return toast('Generate this clip first.');
          const rec = await AudioLib.load(c.audioId), sr = rec.sr;
          const s0 = Math.round((c.offset || 0) * sr), n = Math.round(c.dur * sr);
          const chs = rec.ch.map(d => { const o = d.slice(s0, s0 + n); for (let i = 0; i < o.length; i++) o[i] *= Mixer.envAt(c, i / sr); return o; });
          Player.playRaw(chs, sr); break;
        }
        case 'split': { const was = S.playhead; if (!(was > c.start && was < c.start + c.dur)) { S.playhead = c.start + c.dur / 2; updatePlayhead(); } splitAtPlayhead(); break; }
        case 'dup': mutate(() => { const d = Object.assign(JSON.parse(JSON.stringify(c)), { id: 'k_' + uid(), seq: null, start: c.start + c.dur }); ch.clips.push(d); S.sel = d.id; }); break;
        case 'flow': mutate(() => { ch.autoFlow = !ch.autoFlow; if (ch.autoFlow) renumberByStart(ch); }); break;
        case 'del': Player.stop(); mutate(() => { ch.clips = ch.clips.filter(k => k !== c); S.sel = null; renumber(ch); }); break;
        case 'tdel': {
          const n = ch.clips.filter(k => k.trackId === t.id).length;
          if (ch.tracks.length === 1) return toast('A chapter needs at least one track.');
          if (await ask('Delete track?', n ? `${n} clip${n === 1 ? '' : 's'} on “${esc(t.name)}” will be deleted too (you can undo).` : 'This track is empty.', [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, danger: true }]))
            mutate(() => { ch.tracks = ch.tracks.filter(x => x !== t); ch.clips = ch.clips.filter(k => k.trackId !== t.id); S.selTrack = null; renumber(ch); });
          break;
        }
      }
    };
  }
  function renumberByStart(ch) { ch.clips.filter(c => c.seq != null).sort((a, b) => a.start - b.start || a.seq - b.seq).forEach((c, i) => { c.seq = i; }); }

  return { render, renderTimeline, renderInspector, updatePlayhead, updateTransport, setBusy };
})();

/* ===== Export ===== */
function dataUrlBytes(u) {
  const [h, b] = u.split(','); const bin = atob(b); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return { bytes: a, type: /png/.test(h) ? 'png' : 'jpeg' };
}
function bookMeta(p, extra) {
  return Object.assign({ title: p.title, artist: p.author, album: p.title, narrator: p.narrator, genre: p.genre || 'Audiobook', year: p.year, cover: p.cover ? dataUrlBytes(p.cover) : null }, extra || {});
}
const FORMATS = {
  m4b: { label: 'M4B audiobook (chapters, Apple Books)', ext: 'm4b', mime: 'audio/mp4' },
  m4a: { label: 'M4A / AAC', ext: 'm4a', mime: 'audio/mp4' },
  mp3: { label: 'MP3', ext: 'mp3', mime: 'audio/mpeg' },
  wav: { label: 'WAV (uncompressed)', ext: 'wav', mime: 'audio/wav' },
};
function makeEncoder(fmt, p) {
  if (fmt === 'wav') return Encoders.wav(p.sampleRate, p.channels);
  if (fmt === 'mp3') return Encoders.mp3(p.sampleRate, p.channels, p.bitrate);
  return Encoders.aac(p.sampleRate, p.channels, p.bitrate, fmt === 'm4b' ? 'M4B ' : 'M4A ');
}
const safeName = s => (String(s || 'audiobook').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'audiobook').slice(0, 80);

async function runExport() {
  const p = S.project, fmt = p.exportFormat, scope = p.exportScope, F = FORMATS[fmt];
  const chapters = scope === 'chapter' ? [chapter()] : p.chapters;
  const missing = chapters.reduce((a, ch) => a + ch.clips.filter(c => c.kind === 'tts' && !c.cut && c.status !== 'ready' && c.status !== 'stale').length, 0);
  const stale = chapters.reduce((a, ch) => a + ch.clips.filter(c => c.status === 'stale').length, 0);
  if (missing || stale) {
    const v = await ask('Some speech isn’t generated', `${missing ? `${missing} clip${missing === 1 ? ' has' : 's have'} no audio yet. ` : ''}${stale ? `${stale} clip${stale === 1 ? '' : 's'} still use an old voice. ` : ''}Generate first?`,
      [{ label: 'Generate, then export', value: 'gen', primary: true }, { label: 'Export anyway', value: 'go' }, { label: 'Cancel', value: null }]);
    if (!v) return;
    if (v === 'gen') { const ok = await generate(chapters.flatMap(c => c.clips)); if (!ok) return; }
  }
  if (!chapters.some(ch => ch.clips.length)) return toast('Nothing to export yet.');
  Progress.open(`Exporting ${F.ext.toUpperCase()}`);
  const files = [];
  try {
    const total = chapters.reduce((a, ch) => a + Mixer.chapterLength(ch) + p.chapterGap, 0) || 1;
    let doneSec = 0;
    const prog = (ch, base) => f => Progress.set((base + f * (Mixer.chapterLength(ch) + p.chapterGap)) / total, `Mixing “${ch.title}”…`);
    const cancelled = () => Progress.cancelled;
    if (scope === 'each') {
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i]; if (!ch.clips.length) continue;
        const enc = makeEncoder(fmt, p);
        await Mixer.renderChapter(p, ch, 0.5, b => enc.write(b), prog(ch, doneSec), cancelled);
        doneSec += Mixer.chapterLength(ch) + p.chapterGap;
        Progress.set(null, `Finishing “${ch.title}”…`);
        const blob = await enc.finish(bookMeta(p, { title: ch.title, album: p.title }), [{ title: ch.title, start: 0 }]);
        files.push({ blob, name: `${String(i + 1).padStart(2, '0')} ${safeName(ch.title)}.${F.ext}` });
      }
    } else {
      const enc = makeEncoder(fmt, p), marks = []; let t = 0;
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i]; if (!ch.clips.length) continue;
        marks.push({ title: ch.title, start: t / p.sampleRate });
        t += await Mixer.renderChapter(p, ch, i === chapters.length - 1 ? 0.5 : p.chapterGap, b => enc.write(b), prog(ch, doneSec), cancelled);
        doneSec += Mixer.chapterLength(ch) + p.chapterGap;
      }
      Progress.set(1, 'Finishing file…');
      const blob = await enc.finish(bookMeta(p), marks);
      files.push({ blob, name: `${safeName(scope === 'chapter' ? `${p.title} - ${chapters[0].title}` : p.title)}.${F.ext}` });
    }
    await deliver(files, F.mime);
  } catch (e) {
    Progress.close();
    if (e.message !== 'Cancelled') ask('Export failed', esc(e.message || e), [{ label: 'OK', primary: true }]); else toast('Export cancelled.');
  }
}

function blobToB64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
}
async function deliver(files, mime) {
  const cap = window.Capacitor && window.Capacitor.Plugins;
  const size = files.reduce((a, f) => a + f.blob.size, 0);
  const mb = (size / 1048576).toFixed(1);
  window.__lastExport = files; // for testing
  if (cap && cap.Filesystem && cap.Share) {
    Progress.set(1, 'Preparing to share…');
    const uris = [];
    for (const f of files) {
      const w = await cap.Filesystem.writeFile({ path: f.name, data: await blobToB64(f.blob), directory: 'CACHE' });
      uris.push(w.uri);
    }
    Progress.close();
    try { await cap.Share.share({ title: (S.project && S.project.title) || files[0].name, files: uris }); } catch (e) { if (!/cancel/i.test(e.message || '')) throw e; }
    return;
  }
  // plain browser
  openModal(`<h2>Export ready</h2><p class="muted small">${files.length} file${files.length === 1 ? '' : 's'} · ${mb} MB</p>${files.map((f, i) => `<p><a href="${URL.createObjectURL(f.blob)}" download="${esc(f.name)}">${esc(f.name)}</a></p>`).join('')}<div class="btns full"><button class="btn p" onclick="closeModal()">Done</button></div>`);
  try { const a = $('#modal a[download]'); if (files.length === 1 && a) a.click(); } catch {}
}

function renderExport(main) {
  const p = S.project;
  const len = p.chapters.reduce((a, c) => a + Mixer.chapterLength(c), 0);
  main.innerHTML = `<div class="wrap">
    <div class="card"><h2>Book details</h2>
      <div style="display:flex;gap:12px;align-items:flex-start">
        <label style="flex:none;cursor:pointer"><div class="cover-sm" style="width:88px;height:88px;${p.cover ? `background-image:url(${p.cover})` : ''}">${p.cover ? '' : '<span class="small">Add<br>cover</span>'}</div><input type="file" accept="image/*" id="cov" hidden></label>
        <div style="flex:1;min-width:0"><label class="f" style="margin-top:0">Title</label><input type="text" data-m="title" value="${esc(p.title)}">
        <label class="f">Author</label><input type="text" data-m="author" value="${esc(p.author)}"></div>
      </div>
      <div class="row2"><div><label class="f">Narrator</label><input type="text" data-m="narrator" value="${esc(p.narrator)}"></div><div><label class="f">Year</label><input type="text" inputmode="numeric" data-m="year" value="${esc(p.year)}"></div></div>
      ${p.cover ? '<div class="btns"><button class="btn sm d" data-e="nocover">Remove cover</button></div>' : ''}
    </div>
    <div class="card"><h2>Export</h2>
      <label class="f" style="margin-top:0">Format</label>
      <select data-m="exportFormat">${Object.entries(FORMATS).map(([k, f]) => `<option value="${k}" ${p.exportFormat === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
      <p class="small muted" id="aacnote"></p>
      <label class="f">What to export</label>
      <select data-m="exportScope">
        <option value="book" ${p.exportScope === 'book' ? 'selected' : ''}>Whole book as one file (${p.chapters.length} chapter${p.chapters.length === 1 ? '' : 's'})</option>
        <option value="each" ${p.exportScope === 'each' ? 'selected' : ''}>One file per chapter</option>
        <option value="chapter" ${p.exportScope === 'chapter' ? 'selected' : ''}>Current chapter only (${esc(chapter().title)})</option>
      </select>
      <div class="row2">
        <div><label class="f">Quality</label><select data-m="bitrate" ${p.exportFormat === 'wav' ? 'disabled' : ''}>${[32, 48, 64, 96, 128, 160].map(b => `<option value="${b}" ${p.bitrate === b ? 'selected' : ''}>${b} kbps${b === 64 ? ' (standard)' : ''}</option>`).join('')}</select></div>
        <div><label class="f">Gap between chapters</label><select data-m="chapterGap">${[0.5, 1, 2, 3, 5].map(g => `<option value="${g}" ${p.chapterGap === g ? 'selected' : ''}>${g} s</option>`).join('')}</select></div>
      </div>
      <p class="small muted">Total length about ${fmtLong(len + p.chapterGap * p.chapters.length)} · ${p.sampleRate / 1000} kHz ${p.channels === 1 ? 'mono' : 'stereo'}. MP3 and M4B files include chapter markers, title, author and cover.</p>
      <div class="btns full"><button class="btn p" data-e="go">Export</button></div>
    </div></div>`;
  const note = async () => {
    const n = $('#aacnote'); if (!n) return;
    if (p.exportFormat === 'm4a' || p.exportFormat === 'm4b') {
      n.textContent = 'Checking AAC support…';
      n.textContent = (await Encoders.aacSupported(p.sampleRate, p.channels, p.bitrate * 1000)) ? 'AAC encoding is available on this device.' : 'This device can’t encode AAC here. M4A/M4B needs iOS 26 or later. MP3 works everywhere.';
    } else n.textContent = '';
  };
  note();
  main.onchange = async e => {
    const k = e.target.dataset.m;
    if (k) { mutate(() => { const v = e.target.value; p[k] = ['bitrate', 'chapterGap'].includes(k) ? Number(v) : v; }, { render: ['exportFormat'].includes(k) }); if (k === 'title') $('.top h1').textContent = p.title; return; }
    if (e.target.id === 'cov') {
      const f = e.target.files[0]; if (!f) return;
      const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
      const s = Math.min(1, 1000 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      mutate(() => { p.cover = cv.toDataURL('image/jpeg', 0.85); });
    }
  };
  main.onclick = e => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    if (b.dataset.e === 'go') runExport();
    if (b.dataset.e === 'nocover') mutate(() => { p.cover = null; });
  };
}

/* ===== Setup tab ===== */
function renderSetup(main) {
  const p = S.project, av = Engine.available();
  main.innerHTML = `<div class="wrap">
    <div class="card"><h2>Voice engine</h2>
      <select data-m="engine">
        <option value="auto" ${p.engine === 'auto' ? 'selected' : ''}>Automatic (${av.native ? 'on-device' : 'in-app web'})</option>
        <option value="native" ${p.engine === 'native' ? 'selected' : ''} ${av.native ? '' : 'disabled'}>On-device native${av.native ? '' : ' — iPhone app only'}</option>
        <option value="web" ${p.engine === 'web' ? 'selected' : ''}>In-app web (downloads ~90 MB once, slower)</option>
        <option value="mock" ${p.engine === 'mock' ? 'selected' : ''}>Test tones (no voice, for trying the editor)</option>
      </select>
      <p class="small muted">Changing engine doesn't change existing audio. Regenerate clips to hear the difference.</p>
    </div>
    <div class="card"><h2>Script timing</h2>
      <div class="row2">
        <div><label class="f" style="margin-top:0">Pause between paragraphs</label><select data-m="paraGap">${[0.3, 0.5, 0.7, 1, 1.5, 2].map(g => `<option value="${g}" ${p.paraGap === g ? 'selected' : ''}>${g} s</option>`).join('')}</select></div>
        <div><label class="f" style="margin-top:0">Pause between lines</label><select data-m="lineGap">${[0, 0.15, 0.3, 0.5, 0.8].map(g => `<option value="${g}" ${p.lineGap === g ? 'selected' : ''}>${g} s</option>`).join('')}</select></div>
      </div>
      <p class="small muted">Applies the next time you build a chapter's timeline.</p>
    </div>
    <div class="card"><h2>Project</h2>
      <p class="small muted">${p.sampleRate / 1000} kHz ${p.channels === 1 ? 'mono' : 'stereo'} · created ${new Date(p.created).toLocaleDateString()}</p>
      <div class="btns"><button class="btn sm" data-x="backup">Back up project text (JSON)</button><label class="btn sm">Restore text backup<input type="file" accept=".json,application/json" id="rest" hidden></label></div>
      <p class="small muted">Backups hold scripts, voices and timeline layout, not audio — regenerate after restoring.</p>
    </div></div>`;
  main.onchange = async e => {
    const k = e.target.dataset.m;
    if (k) return mutate(() => { p[k] = k === 'engine' ? e.target.value : Number(e.target.value); }, { render: false });
    if (e.target.id === 'rest') {
      try {
        const j = JSON.parse(await e.target.files[0].text());
        if (!j.chapters || !j.cast) throw new Error('Not a project backup.');
        j.id = 'p_' + uid(); j.title = (j.title || 'Restored') + ' (restored)'; j.updated = Date.now();
        for (const ch of j.chapters) for (const c of ch.clips) { if (c.kind === 'tts' && !c.cut) { c.status = 'pending'; delete c.audioId; } }
        for (const ch of j.chapters) ch.clips = ch.clips.filter(c => c.kind === 'tts' && !c.cut);
        await DB.put('projects', j); toast('Restored as a new project.'); openProject(j.id, 'script');
      } catch (err) { ask('Couldn’t restore', esc(err.message), [{ label: 'OK', primary: true }]); }
    }
  };
  main.onclick = async e => {
    if (e.target.closest('[data-x=backup]')) {
      const blob = new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
      await deliver([{ blob, name: safeName(p.title) + ' backup.json' }], 'application/json');
    }
  };
}

/* ===== Boot ===== */
window.addEventListener('pointerdown', () => { try { Player.ensure(); } catch {} }, { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
render();
