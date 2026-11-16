/* ===== MP4 / M4A / M4B muxer (AAC audio + QuickTime chapter track + Nero chpl + iTunes tags) ===== */
const MP4 = (() => {
  const te = new TextEncoder();
  const hex = h => new Uint8Array(h.match(/../g).map(b => parseInt(b, 16)));
  const u8 = v => new Uint8Array([v & 255]);
  const u16 = v => new Uint8Array([(v >> 8) & 255, v & 255]);
  const u32 = v => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
  const u64 = v => { const hi = Math.floor(v / 4294967296), lo = v >>> 0; return cat([u32(hi), u32(lo)]); };
  const str = s => te.encode(s);
  function cat(parts) {
    let n = 0; for (const p of parts) n += p.length;
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function box(type, ...parts) {
    const body = cat(parts.flat());
    return cat([u32(body.length + 8), Uint8Array.from(type, ch => ch.charCodeAt(0) & 255), body]);
  }
  const full = (type, ver, flags, ...parts) => box(type, u8(ver), u8(flags >> 16), u16(flags & 0xffff), ...parts);
  const MATRIX = cat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);

  // Captured from a known-good ffmpeg/iTunes chapter track
  const CHAP_GMHD = hex('0000004c676d686400000018676d696e000000000040800080008000000000000000002c74657874000100000000000000000000000000000001000000000000000000000000000040000000');
  const CHAP_STSD = hex('0000004b7374736400000000000000010000003b7465787400000000000000010000000100000000000000000000000000000000000000010000000000000000000d667461620001000100');
  const ENCD = hex('0000000c656e636400000100');

  function descr(tag, body) { return cat([u8(tag), u8(0x80), u8(0x80), u8(0x80), u8(body.length), body]); }
  function esds(asc, bitrate) {
    const dsi = descr(5, asc);
    const dcd = descr(4, cat([u8(0x40), u8(0x15), u8(0), u16(0), u32(bitrate), u32(bitrate), dsi]));
    const es = descr(3, cat([u16(1), u8(0), dcd, descr(6, u8(2))]));
    return full('esds', 0, 0, es);
  }
  // Fallback AudioSpecificConfig for AAC-LC
  function makeASC(sr, ch) {
    const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    const fi = rates.indexOf(sr);
    return new Uint8Array([(2 << 3) | (fi >> 1), ((fi & 1) << 7) | (ch << 3)]);
  }

  function stbl(stsd, deltas, sizes, offsets) {
    // stts: run-length compress deltas
    const runs = [];
    for (const d of deltas) { const r = runs[runs.length - 1]; if (r && r[1] === d) r[0]++; else runs.push([1, d]); }
    return box('stbl',
      stsd,
      full('stts', 0, 0, u32(runs.length), ...runs.map(([c, d]) => cat([u32(c), u32(d)]))),
      full('stsc', 0, 0, u32(1), u32(1), u32(offsets.length === 1 ? sizes.length : 1), u32(1)),
      full('stsz', 0, 0, u32(0), u32(sizes.length), ...sizes.map(u32)),
      full('stco', 0, 0, u32(offsets.length), ...offsets.map(u32)));
  }

  function tagAtom(name, text) {
    return box(name, full('data', 0, 1, u32(0), str(text)));
  }

  /**
   * Build an M4A/M4B file.
   * @param {object} o { sampleRate, channels, bitrate, asc, packets: Uint8Array[], chapters: [{title,start(sec)}],
   *                     totalSamples, meta: {title, artist, album, narrator, genre, year, cover: {bytes, type:'jpeg'|'png'}}, brand:'M4A '|'M4B ' }
   * @returns Blob
   */
  function build(o) {
    const sr = o.sampleRate, ts = sr;
    const nPk = o.packets.length;
    const audioDur = nPk * 1024;
    const brand = o.brand || 'M4A ';
    const ftyp = box('ftyp', str(brand), u32(0x200), str(brand), str('M4A '), str('mp42'), str('isom'));

    // chapter samples
    const chaps = (o.chapters || []).filter(c => c && c.title != null);
    const chapSamples = chaps.map(c => { const t = str(String(c.title).slice(0, 255)); return cat([u16(t.length), t, ENCD]); });
    const chapTs = 1000;
    const totalMs = Math.round(audioDur / sr * 1000);
    const chapStartsMs = chaps.map(c => Math.max(0, Math.round(c.start * 1000)));
    const chapDeltas = chapStartsMs.map((s, i) => Math.max(1, (i + 1 < chapStartsMs.length ? chapStartsMs[i + 1] : totalMs) - s));

    // mdat layout: [header][audio packets][chapter samples]
    let audioBytes = 0; for (const p of o.packets) audioBytes += p.length;
    let chapBytes = 0; for (const s of chapSamples) chapBytes += s.length;
    const mdatSize = 8 + audioBytes + chapBytes;
    const mdatHdr = cat([u32(mdatSize), str('mdat')]);
    const audioOffset = ftyp.length + 8;
    const chapOffsets = []; let off = audioOffset + audioBytes;
    for (const s of chapSamples) { chapOffsets.push(off); off += s.length; }

    const hasChap = chaps.length > 0;
    const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(ts), u32(audioDur), u32(0x10000), u16(0x100), u16(0), u32(0), u32(0),
      MATRIX, u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), u32(hasChap ? 3 : 2));

    const mp4a = box('mp4a', new Uint8Array(6), u16(1), u32(0), u32(0), u16(o.channels), u16(16), u16(0), u16(0), u32(sr << 16 >>> 0),
      esds(o.asc || makeASC(sr, o.channels), o.bitrate));
    const audioTrak = box('trak',
      full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(audioDur), u32(0), u32(0), u16(0), u16(0), u16(0x100), u16(0), MATRIX, u32(0), u32(0)),
      hasChap ? box('tref', box('chap', u32(2))) : [],
      box('mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(ts), u32(audioDur), u16(0x55c4), u16(0)),
        full('hdlr', 0, 0, u32(0), str('soun'), u32(0), u32(0), u32(0), str('SoundHandler\0')),
        box('minf',
          full('smhd', 0, 0, u32(0)),
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          stbl(full('stsd', 0, 0, u32(1), mp4a), new Array(nPk).fill(1024), o.packets.map(p => p.length), [audioOffset]))));

    const chapTrak = !hasChap ? [] : box('trak',
      full('tkhd', 0, 0, u32(0), u32(0), u32(2), u32(0), u32(audioDur), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(0), u32(0)),
      box('mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(chapTs), u32(totalMs), u16(0), u16(0)),
        full('hdlr', 0, 0, u32(0), str('text'), u32(0), u32(0), u32(0), str('SubtitleHandler\0')),
        box('minf',
          CHAP_GMHD,
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          box('stbl',
            CHAP_STSD,
            full('stts', 0, 0, u32(chapDeltas.length), ...chapDeltas.map(d => cat([u32(1), u32(d)]))),
            full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
            full('stsz', 0, 0, u32(0), u32(chapSamples.length), ...chapSamples.map(s => u32(s.length))),
            full('stco', 0, 0, u32(chapOffsets.length), ...chapOffsets.map(u32))))));

    // iTunes metadata
    const m = o.meta || {};
    const tags = [];
    if (m.title) tags.push(tagAtom('©nam', m.title));
    if (m.artist) tags.push(tagAtom('©ART', m.artist));
    if (m.album || m.title) tags.push(tagAtom('©alb', m.album || m.title));
    if (m.narrator) tags.push(tagAtom('©wrt', m.narrator));
    if (m.year) tags.push(tagAtom('©day', String(m.year)));
    tags.push(tagAtom('©gen', m.genre || 'Audiobook'));
    tags.push(tagAtom('©too', 'Audiobook Studio'));
    if (brand === 'M4B ') tags.push(box('stik', full('data', 0, 21, u32(0), u8(2))));
    if (m.cover && m.cover.bytes) tags.push(box('covr', full('data', 0, m.cover.type === 'png' ? 14 : 13, u32(0), m.cover.bytes)));
    const meta = full('meta', 0, 0,
      full('hdlr', 0, 0, u32(0), str('mdir'), str('appl'), u32(0), u32(0), u8(0)),
      box('ilst', ...tags));
    // Nero chapters (read by many non-Apple players)
    const chpl = !hasChap ? [] : full('chpl', 1, 0, u32(0), u8(Math.min(255, chaps.length)),
      ...chaps.slice(0, 255).map((c, i) => { const t = str(String(c.title).slice(0, 200)); return cat([u64(chapStartsMs[i] * 10000), u8(t.length), t]); }));
    const udta = box('udta', meta, chpl);

    const moov = box('moov', mvhd, audioTrak, chapTrak, udta);
    return new Blob([ftyp, mdatHdr, ...o.packets, ...chapSamples, moov], { type: brand === 'M4B ' ? 'audio/mp4' : 'audio/mp4' });
  }

  return { build, makeASC };
})();
