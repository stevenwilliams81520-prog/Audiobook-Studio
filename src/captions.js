/* ===== Follow-along captions: words highlighted while audio plays =====
 * Timing: each spoken piece's start/end is exact (we made the audio); words inside a piece
 * are spread by length, with extra weight for punctuation pauses. */
const Captions = (() => {
  // Where speech actually starts/ends inside a generated buffer (trims Kokoro's silence)
  function speechBounds(data, sr) {
    const th = 0.015; let a = 0, b = data.length - 1;
    while (a < data.length && Math.abs(data[a]) < th) a++;
    while (b > a && Math.abs(data[b]) < th) b--;
    if (a >= b) return [0, data.length / sr];
    return [Math.max(0, a / sr - 0.03), Math.min(data.length / sr, (b + 1) / sr + 0.03)];
  }
  function words(text, s, e) {
    const ws = String(text).split(/\s+/).filter(Boolean);
    const wt = ws.map(w => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2 + (/[.!?]["'’”)]*$/.test(w) ? 6 : /[,;:—-]["'’”)]*$/.test(w) ? 3 : 0));
    const tot = wt.reduce((a, b) => a + b, 0) || 1;
    let t = s; const span = Math.max(0.01, e - s);
    return ws.map((w, i) => { const d = span * wt[i] / tot; const o = { w, s: t, e: t + d }; t += d; return o; });
  }
  // Build markup for a list of segments [{text, s, e, who?, color?}]
  function html(segs) {
    return segs.map((g, i) => `<p class="cseg" data-g="${i}">${g.who ? `<b class="cwho" style="color:${g.color || 'var(--accent)'}">${esc(g.who)}</b> ` : ''}${words(g.text, g.s, g.e).map(x => `<span class="cw" data-s="${x.s.toFixed(3)}" data-e="${x.e.toFixed(3)}">${esc(x.w)}</span>`).join(' ')}</p>`).join('');
  }
  // Highlight the word at time t inside box; keep it in view
  function highlight(box, t) {
    if (!box) return;
    let cur = box.querySelector('.cw.now');
    if (cur && t >= +cur.dataset.s && t < +cur.dataset.e) return;
    if (cur) cur.classList.remove('now');
    box.querySelectorAll('.cseg.cur').forEach(x => x.classList.remove('cur'));
    const all = box.querySelectorAll('.cw');
    let found = null;
    for (const w of all) { if (t >= +w.dataset.s && t < +w.dataset.e) { found = w; break; } if (+w.dataset.s > t) break; }
    // between pieces: keep the last spoken word lit
    if (!found) { for (const w of all) { if (+w.dataset.e <= t) found = w; else break; } if (found && t - +found.dataset.e > 1.2) found = null; }
    if (!found) return;
    found.classList.add('now');
    found.parentElement.classList.add('cur');
    const bt = box.getBoundingClientRect(), r = found.getBoundingClientRect();
    if (r.top < bt.top + 8 || r.bottom > bt.bottom - 8) box.scrollTop += r.top - bt.top - box.clientHeight / 3;
  }
  // SubRip subtitles from segments
  function srt(segs) {
    const ts = t => { const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
    return segs.map((g, i) => `${i + 1}\n${ts(g.s)} --> ${ts(g.e)}\n${g.who ? g.who + ': ' : ''}${g.text}\n`).join('\n');
  }
  /* ---- Speed reader (one word at a time, focus letter on a fixed point) ---- */
  function flat(segs) { return segs.flatMap(g => words(g.text, g.s, g.e).map(x => Object.assign(x, { who: g.who, color: g.color }))); }
  function focusIndex(w) {
    const lead = w.length - w.replace(/^[^\p{L}\p{N}]+/u, '').length;
    const L = w.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '').length;
    return Math.min(w.length - 1, lead + (L <= 1 ? 0 : L <= 5 ? 1 : L <= 9 ? 2 : L <= 13 ? 3 : 4));
  }
  function rsvpHtml() {
    return `<div class="rsvp"><div class="rsvp-who"></div><div class="rsvp-line" aria-live="off"><span class="rp"></span><span class="ro"></span><span class="rq"></span></div><div class="rsvp-bar"><i></i></div></div>`;
  }
  function rsvp(box, list, t, t0, t1) {
    const el = box && box.querySelector('.rsvp'); if (!el || !list) return;
    let i = -1, lo = 0, hi = list.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].s <= t) { i = m; lo = m + 1; } else hi = m - 1; }
    const live = i >= 0 && t < list[i].e;
    const show = i >= 0 && (live || t - list[i].e < 1.2) ? i : (i < 0 && list.length ? 0 : -1);
    const dim = !live;
    if (el._i !== show || el._d !== dim) {
      el._i = show; el._d = dim;
      el.classList.toggle('dim', dim);
      const x = list[show];
      const [rp, ro, rq] = el.querySelectorAll('.rp,.ro,.rq');
      if (!x) { rp.textContent = ro.textContent = rq.textContent = ''; }
      else { const w = x.w, k = focusIndex(w), ch = Array.from(w); const kk = Array.from(w.slice(0, k)).length; rp.textContent = ch.slice(0, kk).join(''); ro.textContent = ch[kk] || ''; rq.textContent = ch.slice(kk + 1).join(''); }
      const who = el.querySelector('.rsvp-who'); who.textContent = x && x.who ? x.who : ''; who.style.color = x && x.color ? x.color : '';
    }
    const span = Math.max(0.001, (t1 == null ? (list.length ? list[list.length - 1].e : 1) : t1) - (t0 || 0));
    el.querySelector('.rsvp-bar i').style.width = Math.max(0, Math.min(1, (t - (t0 || 0)) / span)) * 100 + '%';
  }
  return { speechBounds, words, html, highlight, srt, flat, rsvpHtml, rsvp, focusIndex };
})();
