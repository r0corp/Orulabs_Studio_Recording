// Ekspor rekaman ke M4A (AAC) untuk WhatsApp dan ponsel.
// Pengodean memakai encoder AAC bawaan Chrome (WebCodecs AudioEncoder); pembungkus MP4/M4A ditulis sendiri.

const jeda = () => new Promise((r) => setTimeout(r, 0));

/** Kodekan sinyal mono Float32 ke frame AAC. Hasil: { frame: Uint8Array[], asc: Uint8Array, rate } */
async function kodekanAac(x, rate, bitrate, tiapPotong) {
  const kanal = Array.isArray(x) ? x : [x], nk = kanal.length, panjang = kanal[0].length;
  if (typeof AudioEncoder === "undefined") throw new Error("Encoder AAC tidak tersedia di Chrome ini");
  const frame = []; let asc = null, galat = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); frame.push(b);
      if (!asc && meta && meta.decoderConfig && meta.decoderConfig.description) asc = new Uint8Array(meta.decoderConfig.description.buffer ? meta.decoderConfig.description.buffer.slice(0) : meta.decoderConfig.description);
    },
    error: (e) => { galat = e; },
  });
  const cfg = { codec: "mp4a.40.2", sampleRate: rate, numberOfChannels: nk, bitrate };
  const dukung = await AudioEncoder.isConfigSupported(cfg);
  if (!dukung.supported) throw new Error("AAC " + rate + " Hz tidak didukung");
  enc.configure(cfg);
  const potong = rate; // 1 detik per potongan
  for (let i = 0; i < panjang; i += potong) {
    const m = Math.min(panjang, i + potong) - i, data = new Float32Array(m * nk);
    for (let c = 0; c < nk; c++) data.set(kanal[c].subarray(i, i + m), c * m); // f32-planar: kanal berurutan
    enc.encode(new AudioData({ format: "f32-planar", sampleRate: rate, numberOfFrames: m, numberOfChannels: nk, timestamp: Math.round(i / rate * 1e6), data }));
    if ((i / potong) % 10 === 0) { tiapPotong && tiapPotong(i / panjang); await jeda(); }
    if (galat) throw galat;
  }
  await enc.flush(); enc.close();
  if (galat) throw galat;
  if (!asc) { // AudioSpecificConfig: AAC-LC, indeks frekuensi, 1 kanal
    const idx = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000].indexOf(rate);
    const v = (2 << 11) | ((idx < 0 ? 3 : idx) << 7) | (nk << 3); asc = new Uint8Array([v >> 8, v & 255]);
  }
  return { frame, asc, rate, nk };
}

// ---------- penulis kotak MP4 ----------
function kotak(tipe, ...isi) {
  const panjang = 8 + isi.reduce((a, b) => a + b.length, 0), o = new Uint8Array(panjang), dv = new DataView(o.buffer);
  dv.setUint32(0, panjang); for (let i = 0; i < 4; i++) o[4 + i] = tipe.charCodeAt(i);
  let p = 8; for (const b of isi) { o.set(b, p); p += b.length; }
  return o;
}
const u8 = (...a) => new Uint8Array(a);
const u16 = (v) => u8((v >> 8) & 255, v & 255);
const u32 = (v) => u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const nol = (n) => new Uint8Array(n);
const teks = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const fullbox = (tipe, versiFlags, ...isi) => kotak(tipe, u32(versiFlags), ...isi);
const MATRIKS = [u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)];
const desk = (tag, ...isi) => { const n = isi.reduce((a, b) => a + b.length, 0); return u8(tag, 0x80, 0x80, 0x80, n & 0x7f, ...isi.flatMap((b) => [...b])); };

/** Bungkus frame AAC menjadi file M4A (mdat sebelum moov). */
function bungkusM4a({ frame, asc, rate, nk }, bitrate) {
  const N = frame.length, durasiSampel = N * 1024, ms = Math.round(durasiSampel / rate * 1000);
  const ftyp = kotak("ftyp", teks("M4A "), u32(0), teks("M4A "), teks("mp42"), teks("isom"));
  const ukuranData = frame.reduce((a, b) => a + b.length, 0);
  const offsetData = ftyp.length + 8;
  const mdat = new Uint8Array(8 + ukuranData); new DataView(mdat.buffer).setUint32(0, 8 + ukuranData); mdat.set(teks("mdat"), 4);
  let p = 8; for (const f of frame) { mdat.set(f, p); p += f.length; }
  const esds = fullbox("esds", 0, desk(0x03, u16(1), u8(0),
    desk(0x04, u8(0x40, 0x15), u8(0, 0x18, 0), u32(bitrate), u32(bitrate), desk(0x05, asc)),
    desk(0x06, u8(0x02))));
  const mp4a = kotak("mp4a", nol(6), u16(1), nol(8), u16(nk || 1), u16(16), u16(0), u16(0), u32(rate * 65536 >>> 0), esds);
  const stsd = fullbox("stsd", 0, u32(1), mp4a);
  const stts = fullbox("stts", 0, u32(1), u32(N), u32(1024));
  const stsc = fullbox("stsc", 0, u32(1), u32(1), u32(N), u32(1));
  const ukuran = new Uint8Array(N * 4); const dvU = new DataView(ukuran.buffer); frame.forEach((f, i) => dvU.setUint32(i * 4, f.length));
  const stsz = fullbox("stsz", 0, u32(0), u32(N), ukuran);
  const stco = fullbox("stco", 0, u32(1), u32(offsetData));
  const stbl = kotak("stbl", stsd, stts, stsc, stsz, stco);
  const minf = kotak("minf", fullbox("smhd", 0, u16(0), u16(0)), kotak("dinf", fullbox("dref", 0, u32(1), fullbox("url ", 1))), stbl);
  const mdia = kotak("mdia", fullbox("mdhd", 0, u32(0), u32(0), u32(rate), u32(durasiSampel), u16(0x55c4), u16(0)),
    fullbox("hdlr", 0, u32(0), teks("soun"), nol(12), teks("SoundHandler"), u8(0)), minf);
  const tkhd = fullbox("tkhd", 3, u32(0), u32(0), u32(1), u32(0), u32(ms), nol(8), u16(0), u16(0), u16(0x0100), u16(0), ...MATRIKS, u32(0), u32(0));
  const mvhd = fullbox("mvhd", 0, u32(0), u32(0), u32(1000), u32(ms), u32(0x10000), u16(0x0100), nol(10), ...MATRIKS, nol(24), u32(2));
  const moov = kotak("moov", mvhd, kotak("trak", tkhd, mdia));
  const hasil = new Uint8Array(ftyp.length + mdat.length + moov.length);
  hasil.set(ftyp, 0); hasil.set(mdat, ftyp.length); hasil.set(moov, ftyp.length + mdat.length);
  return hasil;
}

/** Ubah sinyal mono (atau [kiri, kanan]) menjadi file M4A (AAC 192 kbps mono / 256 kbps stereo). Mengembalikan Uint8Array. */
export async function keM4a(x, rate, tiapPotong) {
  // AAC bawaan mendukung 44,1/48 kHz; selain itu diubah ke 48 kHz
  const ubah = (s) => { const n = Math.floor(s.length * 48000 / rate), o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * rate / 48000, a = Math.floor(p), f = p - a; o[i] = (s[a] || 0) * (1 - f) + (s[a + 1] || 0) * f; } return o; };
  let data = x, r = rate;
  if (r !== 48000 && r !== 44100) { data = Array.isArray(x) ? x.map(ubah) : ubah(x); r = 48000; }
  const bitrate = Array.isArray(x) ? 256000 : 192000;
  const aac = await kodekanAac(data, r, bitrate, tiapPotong);
  return bungkusM4a(aac, bitrate);
}
