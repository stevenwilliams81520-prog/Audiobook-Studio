/* ===== App state & utilities ===== */
const COLORS = ['#5b7cfa', '#d9962b', '#3fa877', '#d0628a', '#9372d6', '#3ea2c4', '#c56f35', '#86a332'];
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
const fmtLong = t => { t = Math.round(t || 0); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ICON = {
  script: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/></svg>',
  studio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h7M14 6h7M3 12h11M18 12h3M3 18h4M11 18h10"/></svg>',
  cast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.8.3 5 2.6 5 5.8"/></svg>',
  export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12M7 8l5-5 5 5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>',
  setup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
  start: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="2.5" height="14" rx="1"/><path d="M19 5v14L9 12z"/></svg>',
  zin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8.5 11h5M11 8.5v5"/></svg>',
  zout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8.5 11h5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
  wand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20L14 10"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  cut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/></svg>',
};

const S = {
  view: 'home', tab: 'script', project: null, chapterId: null,
  sel: null, selTrack: null, pps: 30, playhead: 0, undo: [], redo: [],
};
const chapter = () => S.project && (S.project.chapters.find(c => c.id === S.chapterId) || S.project.chapters[0]);
const castById = id => S.project.cast.find(c => c.id === id) || S.project.cast[0];
const trackById = id => chapter().tracks.find(t => t.id === id);
const genKey = cast => `${cast.voice}|${cast.speed}`;

/* ---------- toast / modal ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.classList.add('on'); return m.firstChild; }
function closeModal() { const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; }
function ask(title, msg, buttons) {
  return new Promise(res => {
    const el = openModal(`<h2>${esc(title)}</h2><p class="muted">${msg}</p><div class="btns full">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'p' : ''} ${b.danger ? 'd' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`);
    el.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; closeModal(); res(buttons[+b.dataset.i].value); };
  });
}
function promptText(title, value, opts = {}) {
  return new Promise(res => {
    const el = openModal(`<h2>${esc(title)}</h2>${opts.multi ? `<textarea id="pt" style="min-height:40vh">${esc(value)}</textarea>` : `<input type="text" id="pt" value="${esc(value)}">`}${opts.hint ? `<p class="small muted">${opts.hint}</p>` : ''}<div class="btns full"><button class="btn" data-v="0">Cancel</button><button class="btn p" data-v="1">${esc(opts.ok || 'OK')}</button></div>`);
    const inp = $('#pt', el); setTimeout(() => inp.focus(), 50);
    el.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const v = inp.value; closeModal(); res(b.dataset.v === '1' ? v : null); };
  });
}
const Progress = {
  cancelled: false,
  open(title, cancellable = true) {
    this.cancelled = false;
    const el = openModal(`<h2>${esc(title)}</h2><div class="bar"><i id="pgb"></i></div><div id="pgt" class="small muted">Starting…</div><div id="pgx"></div>${cancellable ? '<div class="btns full"><button class="btn" id="pgc">Cancel</button></div>' : ''}`);
    const c = $('#pgc', el); if (c) c.onclick = () => { this.cancelled = true; c.disabled = true; c.textContent = 'Cancelling…'; };
  },
  set(frac, text) { const b = $('#pgb'), t = $('#pgt'); if (b && frac != null) b.style.width = clamp(frac, 0, 1) * 100 + '%'; if (t && text) t.textContent = text; },
  close() { closeModal(); }
};

/* ---------- persistence & undo ---------- */
let saveT;
function save(now) {
  if (!S.project) return;
  S.project.updated = Date.now();
  clearTimeout(saveT);
  const p = S.project;
  const go = () => DB.put('projects', JSON.parse(JSON.stringify(p))).catch(e => toast('Save failed: ' + e.message));
  if (now) return go();
  saveT = setTimeout(go, 400);
}
function mutate(fn, opts = {}) {
  const snap = JSON.stringify(S.project);
  fn();
  S.undo.push(snap); if (S.undo.length > 40) S.undo.shift(); S.redo = [];
  if (opts.reflow !== false) reflow(chapter());
  save();
  if (opts.render !== false) render();
}
function undo() { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.project)); S.project = JSON.parse(S.undo.pop()); fixSel(); save(); render(); }
function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.project)); S.project = JSON.parse(S.redo.pop()); fixSel(); save(); render(); }
function fixSel() {
  if (!S.project.chapters.some(c => c.id === S.chapterId)) S.chapterId = S.project.chapters[0].id;
  if (S.sel && !chapter().clips.some(c => c.id === S.sel)) S.sel = null;
}

/* ---------- model ---------- */
function newTrack(name, kind, castId, i) { return { id: 't_' + uid(), name, kind, castId: castId || null, gain: 1, mute: false, solo: false, color: COLORS[(i || 0) % COLORS.length] }; }
function newChapter(title) { return { id: 'c_' + uid(), title, script: '', autoFlow: true, tracks: [newTrack('Narrator', 'voice', 'narrator', 0)], clips: [] }; }
function newProject(title, opts = {}) {
  const ch = newChapter('Chapter 1');
  return {
    id: 'p_' + uid(), title: title || 'Untitled audiobook', author: '', narrator: '', genre: 'Audiobook', year: '', cover: null,
    sampleRate: opts.sampleRate || 24000, channels: opts.channels || 1, engine: 'auto',
    paraGap: 0.7, lineGap: 0.3, chapterGap: 2, exportFormat: 'm4b', exportScope: 'book', bitrate: 64,
    cast: [{ id: 'narrator', name: 'Narrator', voice: 'bm_george', speed: 1, color: COLORS[0] }],
    chapters: [ch], created: Date.now(), updated: Date.now(), v: 1
  };
}
function reflow(ch) {
  if (!ch || !ch.autoFlow) return;
  const seq = ch.clips.filter(c => c.seq != null).sort((a, b) => a.seq - b.seq);
  let t = ch.flowStart || 0;
  for (const c of seq) { c.start = t; t += c.dur + (c.gapAfter || 0); }
}
function estDur(text, speed) { return Math.max(0.8, text.length / 15 / (speed || 1)); }
function voiceTrackFor(ch, castId) {
  let t = ch.tracks.find(t => t.kind === 'voice' && t.castId === castId);
  if (!t) {
    const cast = castById(castId);
    t = newTrack(cast.name, 'voice', castId, ch.tracks.length);
    t.color = cast.color;
    const lastVoice = ch.tracks.map(x => x.kind).lastIndexOf('voice');
    ch.tracks.splice(lastVoice + 1, 0, t);
  }
  return t;
}

/* ---------- script parsing ---------- */
const SPEAKER_RE = /^([A-Za-zÀ-ɏ0-9][A-Za-zÀ-ɏ0-9 .'’\-]{0,38}):\s*(.*)$/;
function parseScript(text, cast, paraGap, lineGap) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks = []; let cur = null;
  const byName = new Map(cast.map(c => [c.name.trim().toLowerCase(), c]));
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (cur) cur.gapAfter = paraGap; cur = null; continue; }
    const m = SPEAKER_RE.exec(line);
    const member = m && byName.get(m[1].trim().toLowerCase());
    if (member) { cur = { castId: member.id, text: m[2], gapAfter: lineGap }; blocks.push(cur); }
    else if (cur) cur.text += ' ' + line;
    else { cur = { castId: cast[0].id, text: line, gapAfter: lineGap }; blocks.push(cur); }
  }
  return blocks.filter(b => b.text.trim());
}
function detectSpeakers(text, cast) {
  const known = new Set(cast.map(c => c.name.trim().toLowerCase()));
  const found = new Map();
  for (const raw of text.split('\n')) {
    const m = SPEAKER_RE.exec(raw.trim());
    if (m && m[2].trim() && m[1].split(' ').length <= 4) { const k = m[1].trim(); if (!known.has(k.toLowerCase())) found.set(k.toLowerCase(), (found.get(k.toLowerCase()) || { name: k, n: 0 })), found.get(k.toLowerCase()).n++; }
  }
  return [...found.values()];
}
function buildTimeline(ch) {
  const p = S.project;
  const blocks = parseScript(ch.script || '', p.cast, p.paraGap, p.lineGap);
  // reuse audio for unchanged lines
  const old = new Map();
  for (const c of ch.clips) if (c.seq != null && c.kind === 'tts' && !c.cut && c.audioId) old.set(c.castId + '\u0001' + c.text, c);
  ch.clips = ch.clips.filter(c => c.seq == null);
  blocks.forEach((b, i) => {
    const cast = castById(b.castId);
    const tr = voiceTrackFor(ch, b.castId);
    const prev = old.get(b.castId + '\u0001' + b.text);
    const clip = { id: 'k_' + uid(), trackId: tr.id, kind: 'tts', castId: b.castId, text: b.text, start: 0, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, seq: i, gapAfter: b.gapAfter, status: 'pending', dur: estDur(b.text, cast.speed) };
    if (prev) Object.assign(clip, { audioId: prev.audioId, dur: prev.dur, offset: 0, genKey: prev.genKey, status: prev.genKey === genKey(cast) ? 'ready' : 'stale', gain: prev.gain, fadeIn: prev.fadeIn, fadeOut: prev.fadeOut });
    ch.clips.push(clip);
  });
  ch.autoFlow = true;
  // drop empty voice tracks that have no clips (except first)
  ch.tracks = ch.tracks.filter((t, i) => i === 0 || t.kind !== 'voice' || ch.clips.some(c => c.trackId === t.id));
  return blocks.length;
}
function splitBook(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const HEAD = /^\s*(#{1,3}\s+.+|(chapter|part|prologue|epilogue)\b.{0,60})\s*$/i;
  const out = []; let cur = null;
  for (const l of lines) {
    if (HEAD.test(l) && l.trim().length < 80) { cur = { title: l.replace(/^\s*#{1,3}\s*/, '').trim(), lines: [] }; out.push(cur); }
    else { if (!cur) { cur = { title: 'Opening', lines: [] }; out.push(cur); } cur.lines.push(l); }
  }
  return out.map(c => ({ title: c.title, script: c.lines.join('\n').trim() })).filter(c => c.script || out.length === 1);
}

/* ---------- generation ---------- */
async function generate(clips, title) {
  const p = S.project;
  const todo = clips.filter(c => c.kind === 'tts' && !c.cut && c.status !== 'ready');
  if (!todo.length) { toast('All speech is already generated.'); return true; }
  Progress.open(title || 'Generating speech');
  const t0 = performance.now(); let doneChars = 0; const totalChars = todo.reduce((a, c) => a + c.text.length, 0);
  try {
    await Engine.ensure(p.engine, (f, msg) => Progress.set(f, msg));
    for (let i = 0; i < todo.length; i++) {
      if (Progress.cancelled) throw new Error('Cancelled');
      const c = todo[i], cast = castById(c.castId);
      const el = (performance.now() - t0) / 1000;
      const eta = doneChars ? el / doneChars * (totalChars - doneChars) : 0;
      Progress.set(i / todo.length, `Clip ${i + 1} of ${todo.length} · ${cast.name} (${voiceName(cast.voice)})${eta > 5 ? ` · about ${fmtLong(eta)} left` : ''}`);
      try {
        const r = await Engine.synth(p.engine, c.text, cast.voice, cast.speed);
        const ch = await resampleChannels([r.data], r.sr, p.sampleRate, 1);
        const id = await AudioLib.save(ch, p.sampleRate);
        Object.assign(c, { audioId: id, dur: ch[0].length / p.sampleRate, offset: 0, status: 'ready', genKey: genKey(cast), error: null });
      } catch (e) {
        if (Progress.cancelled) throw e;
        c.status = 'error'; c.error = e.message || String(e);
        console.error(e);
      }
      doneChars += c.text.length;
      for (const chp of p.chapters) reflow(chp);
      save();
      if (S.tab === 'studio') Studio.renderTimeline();
    }
    Progress.close();
    const errs = todo.filter(c => c.status === 'error').length;
    toast(errs ? `${errs} clip(s) failed — tap them to retry.` : `Generated ${todo.length} clip(s) in ${fmtLong((performance.now() - t0) / 1000)}.`);
    render();
    return !errs;
  } catch (e) {
    Progress.close(); save(); render();
    if (e.message !== 'Cancelled') ask('Voice engine problem', esc(e.message || e), [{ label: 'OK', primary: true }]); else toast('Stopped.');
    return false;
  }
}

/* ---------- GC unreferenced audio ---------- */
async function gcAudio() {
  try {
    const projects = await DB.all('projects');
    const used = new Set();
    for (const p of projects) for (const ch of p.chapters) for (const c of ch.clips) if (c.audioId) used.add(c.audioId);
    if (S.project) for (const ch of S.project.chapters) for (const c of ch.clips) if (c.audioId) used.add(c.audioId);
    for (const u of S.undo.concat(S.redo)) for (const m of u.matchAll(/"audioId":"([^"]+)"/g)) used.add(m[1]);
    const keys = await DB.keys('audio');
    for (const k of keys) if (!used.has(k)) await AudioLib.remove(k);
  } catch (e) { console.warn('gc', e); }
}

/* ===== Views ===== */
function render() {
  const app = $('#app');
  if (S.view === 'home') return renderHome(app);
  renderProject(app);
}

async function renderHome(app) {
  Player.stop();
  const projects = (await DB.all('projects')).sort((a, b) => b.updated - a.updated);
  app.innerHTML = `
    <header class="top"><h1>Audiobook Studio</h1><span class="eng">${esc(Engine.label(Engine.available().native ? 'native' : 'web'))}</span></header>
    <main><div class="wrap">
      ${Quick.html()}
      <div style="display:flex;align-items:center;justify-content:space-between;margin:18px 2px 10px"><b style="font-size:16px">Projects</b><button class="btn p sm" data-a="new">+ New project</button></div>
      ${projects.length ? `<div class="list">${projects.map(p => {
        const n = p.chapters.reduce((a, c) => a + c.clips.length, 0);
        return `<div class="item" data-open="${p.id}">
          <div class="cover-sm" style="${p.cover ? `background-image:url(${p.cover})` : ''}">${p.cover ? '' : esc((p.title || '?')[0].toUpperCase())}</div>
          <div class="grow"><b>${esc(p.title)}</b><span class="small muted">${p.chapters.length} chapter${p.chapters.length === 1 ? '' : 's'} · ${n} clips · ${p.cast.length} voice${p.cast.length === 1 ? '' : 's'}</span></div>
          <button class="btn sm" data-more="${p.id}">•••</button></div>`;
      }).join('')}</div>` : `<div class="empty" style="padding:20px"><p class="small">No projects yet. A project holds a whole book: chapters, a voice for each character, a multi-track timeline for music and effects, and audiobook export (M4B, MP3, M4A, WAV).</p></div>`}
    </div></main>`;
  Quick.bind(app);
  app.onclick = async e => {
    if (await Quick.onClick(e, app)) return;
    const more = e.target.closest('[data-more]');
    if (more) {
      e.stopPropagation();
      const p = projects.find(x => x.id === more.dataset.more);
      const act = await ask(p.title, 'What would you like to do?', [{ label: 'Duplicate', value: 'dup' }, { label: 'Rename', value: 'ren' }, { label: 'Delete', value: 'del', danger: true }, { label: 'Cancel', value: null }]);
      if (act === 'dup') { const c = JSON.parse(JSON.stringify(p)); c.id = 'p_' + uid(); c.title += ' (copy)'; c.updated = Date.now(); await DB.put('projects', c); render(); }
      if (act === 'ren') { const t = await promptText('Rename project', p.title); if (t) { p.title = t; await DB.put('projects', p); render(); } }
      if (act === 'del' && await ask('Delete project?', `“${esc(p.title)}” and all its audio will be removed from this device.`, [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, danger: true }])) { await DB.del('projects', p.id); await gcAudio(); render(); }
      return;
    }
    const op = e.target.closest('[data-open]');
    if (op) return openProject(op.dataset.open);
    if (e.target.closest('[data-a=new]')) {
      const el = openModal(`<h2>New project</h2>
        <label class="f">Title</label><input type="text" id="np-t" placeholder="My audiobook">
        <label class="f">Audio quality</label>
        <select id="np-q"><option value="24000|1">Speech (24 kHz mono) — smallest files</option><option value="44100|1">Speech + music (44.1 kHz mono)</option><option value="44100|2">Speech + music (44.1 kHz stereo)</option></select>
        <p class="small muted">Kokoro voices are 24 kHz. Choose 44.1 kHz if you'll add music or sound effects. This can't be changed later.</p>
        <div class="btns full"><button class="btn" data-v="0">Cancel</button><button class="btn p" data-v="1">Create</button></div>`);
      el.onclick = async ev => {
        const b = ev.target.closest('[data-v]'); if (!b) return;
        if (b.dataset.v === '1') {
          const [sr, chn] = $('#np-q').value.split('|').map(Number);
          const p = newProject($('#np-t').value.trim(), { sampleRate: sr, channels: chn });
          await DB.put('projects', p); closeModal(); openProject(p.id, 'script');
        } else closeModal();
      };
    }
  };
}

async function openProject(id, tab) {
  S.project = await DB.get('projects', id);
  S.view = 'project'; S.tab = tab || 'studio'; S.chapterId = S.project.chapters[0].id; S.sel = null; S.selTrack = null; S.playhead = 0; S.undo = []; S.redo = [];
  render();
  gcAudio();
}

function renderProject(app) {
  const p = S.project, ch = chapter();
  const tabs = [['script', 'Script'], ['studio', 'Studio'], ['cast', 'Voices'], ['export', 'Export'], ['setup', 'Setup']];
  const showCh = ['script', 'studio'].includes(S.tab);
  app.innerHTML = `
    <header class="top"><button class="ib" data-a="home" aria-label="Projects">${ICON.back}</button><h1>${esc(p.title)}</h1><span class="eng">${esc(Engine.label(Engine.kind || (p.engine === 'auto' ? (Engine.available().native ? 'native' : 'web') : p.engine)))}</span></header>
    ${showCh ? `<div class="chbar"><select id="chsel">${p.chapters.map((c, i) => `<option value="${c.id}" ${c.id === ch.id ? 'selected' : ''}>${i + 1}. ${esc(c.title)}</option>`).join('')}</select>
      <button class="btn sm" data-a="ch-add">+ Chapter</button><button class="btn sm" data-a="ch-menu">•••</button></div>` : ''}
    <main id="main" class="${S.tab === 'studio' ? 'studio' : ''}"></main>
    <nav class="tabs">${tabs.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${ICON[k]}${l}</button>`).join('')}</nav>`;
  app.onclick = onProjectClick;
  const sel = $('#chsel');
  if (sel) sel.onchange = () => { Player.stop(); S.chapterId = sel.value; S.sel = null; S.playhead = 0; render(); };
  const main = $('#main');
  ({ script: renderScript, studio: r => Studio.render(r), cast: renderCast, export: renderExport, setup: renderSetup })[S.tab](main);
}

async function onProjectClick(e) {
  const t = e.target.closest('[data-tab]');
  if (t) { if (S.tab !== t.dataset.tab) { if (t.dataset.tab !== 'studio') Player.stop(); S.tab = t.dataset.tab; render(); } return; }
  const a = e.target.closest('[data-a]'); if (!a) return;
  const p = S.project, ch = chapter();
  switch (a.dataset.a) {
    case 'home': Player.stop(); await save(true); S.view = 'home'; S.project = null; render(); break;
    case 'ch-add': {
      const t = await promptText('New chapter', `Chapter ${p.chapters.length + 1}`);
      if (t) mutate(() => { const c = newChapter(t); c.tracks[0].castId = p.cast[0].id; c.tracks[0].name = p.cast[0].name; p.chapters.splice(p.chapters.indexOf(ch) + 1, 0, c); S.chapterId = c.id; S.sel = null; });
      break;
    }
    case 'ch-menu': {
      const i = p.chapters.indexOf(ch);
      const act = await ask(ch.title, `Chapter ${i + 1} of ${p.chapters.length}`, [
        { label: 'Rename', value: 'ren' }, { label: 'Move up', value: 'up' }, { label: 'Move down', value: 'down' }, { label: 'Duplicate', value: 'dup' },
        { label: 'Delete chapter', value: 'del', danger: true }, { label: 'Cancel', value: null }]);
      if (act === 'ren') { const t = await promptText('Rename chapter', ch.title); if (t) mutate(() => { ch.title = t; }); }
      if (act === 'up' && i > 0) mutate(() => { p.chapters.splice(i, 1); p.chapters.splice(i - 1, 0, ch); });
      if (act === 'down' && i < p.chapters.length - 1) mutate(() => { p.chapters.splice(i, 1); p.chapters.splice(i + 1, 0, ch); });
      if (act === 'dup') mutate(() => { const c = JSON.parse(JSON.stringify(ch)); c.id = 'c_' + uid(); c.title += ' (copy)'; c.clips.forEach(k => k.id = 'k_' + uid()); p.chapters.splice(i + 1, 0, c); S.chapterId = c.id; });
      if (act === 'del') {
        if (p.chapters.length === 1) return toast('A project needs at least one chapter.');
        if (await ask('Delete chapter?', `“${esc(ch.title)}” and its timeline will be removed. You can undo this in the Studio.`, [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, danger: true }]))
          mutate(() => { p.chapters.splice(i, 1); S.chapterId = p.chapters[Math.max(0, i - 1)].id; S.sel = null; });
      }
      break;
    }
  }
}

/* ---------- Script tab ---------- */
function renderScript(main) {
  const p = S.project, ch = chapter();
  const blocks = parseScript(ch.script || '', p.cast, p.paraGap, p.lineGap);
  const ready = ch.clips.filter(c => c.kind === 'tts' && c.status === 'ready').length, tts = ch.clips.filter(c => c.kind === 'tts').length;
  main.innerHTML = `<div class="wrap">
    <div class="card">
      <h2>Script — ${esc(ch.title)}</h2>
      <textarea class="script" id="scr" placeholder="Paste or type this chapter.\n\nPlain paragraphs are read by the Narrator.\n\nStart a line with a character's name and a colon to give it their voice, e.g.\nWorshipful Master: Brethren, assist me to open the Lodge.">${esc(ch.script || '')}</textarea>
      <p class="small muted" id="scr-info">${blocks.length} line${blocks.length === 1 ? '' : 's'} · ${tts ? `${ready}/${tts} clips generated` : 'not on the timeline yet'}</p>
      <div class="btns full">
        <button class="btn p" data-s="build">Build timeline</button>
        <button class="btn" data-s="gen">Generate audio</button>
      </div>
      <div class="btns">
        <button class="btn sm" data-s="speakers">Find characters</button>
        <button class="btn sm" data-s="book">Import whole book…</button>
        <label class="btn sm">Open .txt<input type="file" accept=".txt,text/plain" id="txtfile" hidden></label>
      </div>
    </div>
    <div class="card small muted">
      <b>Tips.</b> “Build timeline” turns each paragraph or speaker line into a clip on that character's track. Rebuilding after edits keeps audio for lines you didn't change. Use “Import whole book” to split text into chapters at headings like “# Title” or “Chapter 3”.
    </div></div>`;
  const ta = $('#scr');
  ta.oninput = () => { ch.script = ta.value; save(); const b = parseScript(ta.value, p.cast, p.paraGap, p.lineGap); $('#scr-info').textContent = `${b.length} line${b.length === 1 ? '' : 's'} · edits not on the timeline until you rebuild`; };
  $('#txtfile').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; const txt = await f.text(); importBook(txt); };
  main.onclick = async e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const k = b.dataset.s;
    if (k === 'build') {
      if (!ch.script.trim()) return toast('Add some text first.');
      if (ch.clips.some(c => c.seq == null && c.kind === 'tts') || (!ch.autoFlow && ch.clips.some(c => c.seq != null))) {
        const ok = await ask('Rebuild timeline?', 'Script clips will be laid out again from the text. Clips you moved by hand will snap back into reading order; music and imported audio stay where they are.', [{ label: 'Cancel', value: false }, { label: 'Rebuild', value: true, primary: true }]);
        if (!ok) return;
      }
      let n; mutate(() => { n = buildTimeline(ch); }, { render: false });
      const need = ch.clips.filter(c => c.kind === 'tts' && c.status !== 'ready').length;
      toast(`${n} clips on the timeline${need ? ` · ${need} need audio` : ''}`);
      if (need && await ask('Generate audio now?', `${need} clip${need === 1 ? '' : 's'} need speech. You can also do this later from the Studio.`, [{ label: 'Later', value: false }, { label: 'Generate', value: true, primary: true }])) await generate(ch.clips);
      S.tab = 'studio'; render();
    }
    if (k === 'gen') {
      if (!ch.clips.some(c => c.kind === 'tts')) { mutate(() => buildTimeline(ch), { render: false }); }
      await generate(ch.clips);
    }
    if (k === 'speakers') {
      const found = detectSpeakers(ch.script, p.cast);
      if (!found.length) return toast('No new “Name:” speakers found.');
      const ok = await ask('Add characters?', `Found: ${found.map(f => `<b>${esc(f.name)}</b> (${f.n})`).join(', ')}. Each gets its own voice and track — change voices in the Voices tab.`, [{ label: 'Cancel', value: false }, { label: 'Add all', value: true, primary: true }]);
      if (ok) mutate(() => found.forEach(f => addCast(f.name)));
    }
    if (k === 'book') { const t = await promptText('Import whole book', '', { multi: true, ok: 'Split into chapters', hint: 'New chapters start at lines like “# Title”, “Chapter 4” or “Prologue”.' }); if (t) importBook(t); }
  };
}
function importBook(text) {
  const parts = splitBook(text);
  if (!parts.length) return toast('No text found.');
  const p = S.project;
  mutate(() => {
    const emptyOnly = p.chapters.length === 1 && !p.chapters[0].script.trim() && !p.chapters[0].clips.length;
    if (emptyOnly) p.chapters = [];
    for (const part of parts) { const c = newChapter(part.title); c.tracks[0].castId = p.cast[0].id; c.tracks[0].name = p.cast[0].name; c.script = part.script; p.chapters.push(c); }
    S.chapterId = p.chapters[emptyOnly ? 0 : p.chapters.length - parts.length].id;
  });
  toast(`Imported ${parts.length} chapter${parts.length === 1 ? '' : 's'}.`);
}

/* ---------- Voices (cast) tab ---------- */
function addCast(name) {
  const p = S.project;
  const used = new Set(p.cast.map(c => c.voice));
  const pickV = (VOICES.find(v => !used.has(v[0])) || VOICES[p.cast.length % VOICES.length])[0];
  const c = { id: 'v_' + uid(), name, voice: pickV, speed: 1, color: COLORS[p.cast.length % COLORS.length] };
  p.cast.push(c); return c;
}
function voiceOptions(sel) {
  const groups = {};
  for (const [id, n, g] of VOICES) (groups[g] = groups[g] || []).push(`<option value="${id}" ${id === sel ? 'selected' : ''}>${n}</option>`);
  return Object.entries(groups).map(([g, o]) => `<optgroup label="${g}">${o.join('')}</optgroup>`).join('');
}
function renderCast(main) {
  const p = S.project;
  main.innerHTML = `<div class="wrap">
    <div class="card"><h2>Voices</h2>
      <p class="small muted">Each character has a voice and speed. In the script, start a line with the character's name and a colon. The first entry reads any untagged text.</p>
      ${p.cast.map((c, i) => `<div class="cast-item" style="--c:${c.color}" data-c="${c.id}">
        <div class="full"><label class="f" style="margin-top:0">Name ${i === 0 ? '<span class="pill">reads untagged text</span>' : ''}</label><input type="text" data-k="name" value="${esc(c.name)}"></div>
        <div><label class="f">Voice</label><select data-k="voice">${voiceOptions(c.voice)}</select></div>
        <div><label class="f">Speed <span class="rangev">${c.speed.toFixed(2)}×</span></label><input type="range" min="0.6" max="1.5" step="0.05" value="${c.speed}" data-k="speed"></div>
        <div class="full btns" style="margin-top:4px"><button class="btn sm" data-x="hear">Hear sample</button>${i > 0 ? '<button class="btn sm d" data-x="del">Remove</button>' : ''}</div>
      </div>`).join('')}
      <div class="btns full"><button class="btn" data-x="add">+ Add character</button></div>
    </div></div>`;
  main.oninput = e => {
    const it = e.target.closest('[data-c]'); if (!it || e.target.dataset.k !== 'speed') return;
    it.querySelector('.rangev').textContent = Number(e.target.value).toFixed(2) + '×';
  };
  main.onchange = e => {
    const it = e.target.closest('[data-c]'); if (!it) return;
    const c = p.cast.find(x => x.id === it.dataset.c), k = e.target.dataset.k;
    mutate(() => {
      if (k === 'name') { c.name = e.target.value.trim() || c.name; for (const ch of p.chapters) for (const t of ch.tracks) if (t.castId === c.id) t.name = c.name; }
      if (k === 'voice' || k === 'speed') {
        c[k] = k === 'speed' ? Number(e.target.value) : e.target.value;
        let n = 0;
        for (const ch of p.chapters) for (const cl of ch.clips) if (cl.castId === c.id && cl.status === 'ready' && !cl.cut) { cl.status = 'stale'; n++; }
        if (n) toast(`${n} ${c.name} clip${n === 1 ? '' : 's'} will be regenerated next time you generate.`);
      }
    }, { render: k !== 'name' });
  };
  main.onclick = async e => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    const it = e.target.closest('[data-c]'), c = it && p.cast.find(x => x.id === it.dataset.c);
    if (b.dataset.x === 'add') { const n = await promptText('Character name', ''); if (n && n.trim()) mutate(() => addCast(n.trim())); }
    if (b.dataset.x === 'del') {
      const used = p.chapters.some(ch => ch.clips.some(k => k.castId === c.id));
      if (await ask('Remove ' + c.name + '?', used ? 'Their clips will be read by ' + esc(p.cast[0].name) + ' instead (and regenerated).' : 'This character isn’t used yet.', [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, danger: true }]))
        mutate(() => {
          p.cast = p.cast.filter(x => x !== c);
          for (const ch of p.chapters) {
            const nt = voiceTrackFor(ch, p.cast[0].id);
            for (const k of ch.clips) if (k.castId === c.id) { k.castId = p.cast[0].id; k.trackId = nt.id; if (!k.cut) k.status = 'stale'; }
            ch.tracks = ch.tracks.filter(t => t.castId !== c.id);
          }
        });
    }
    if (b.dataset.x === 'hear') {
      b.disabled = true; const old = b.textContent; b.textContent = 'Loading…';
      try {
        const sample = `Hello, I'm ${c.name}. This is how I sound reading your book.`;
        await Engine.ensure(p.engine, (f, m) => { b.textContent = Math.round(f * 100) + '%'; });
        b.textContent = 'Speaking…';
        const r = await Engine.synth(p.engine, sample, c.voice, c.speed);
        await Player.playRaw([r.data], r.sr);
      } catch (err) { ask('Voice engine problem', esc(err.message || err), [{ label: 'OK', primary: true }]); }
      b.disabled = false; b.textContent = old;
    }
  };
}
