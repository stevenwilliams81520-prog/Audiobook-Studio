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
  return { speechBounds, words, html, highlight, srt };
})();
