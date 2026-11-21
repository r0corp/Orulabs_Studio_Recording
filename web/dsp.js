// Mesin suara Orulab Studio: WAV, analisa rekaman, dan rantai efek studio.
// Semua dikerjakan di laptop (tanpa internet).

const db = (x) => (x <= 0 ? -120 : 20 * Math.log10(x));

// ================= WAV =================
/** Ubah Float32Array mono menjadi file WAV PCM 16-bit. */
export function keWav(sampel, rate) {
  const n = sampel.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const tulis = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  tulis(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); tulis(8, "WAVE");
  tulis(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tulis(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0, o = 44; i < n; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, sampel[i]));
    v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Baca WAV PCM 16-bit (mono/stereo) menjadi { data: Float32Array mono, rate }. Null bila format lain. */
export function bacaWav(arrayBuffer) {
  const v = new DataView(arrayBuffer);
  const teks = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (arrayBuffer.byteLength < 44 || teks(0) !== "RIFF" || teks(8) !== "WAVE") return null;
  let o = 12, kanal = 1, rate = 48000, bit = 16, format = 1;
  while (o + 8 <= arrayBuffer.byteLength) {
    const id = teks(o), len = v.getUint32(o + 4, true);
    if (id === "fmt ") { format = v.getUint16(o + 8, true); kanal = v.getUint16(o + 10, true); rate = v.getUint32(o + 12, true); bit = v.getUint16(o + 22, true); }
    else if (id === "data") {
      if (format !== 1 || bit !== 16) return null;
      const n = Math.floor(Math.min(len, arrayBuffer.byteLength - o - 8) / 2 / kanal), out = new Float32Array(n);
      for (let i = 0, p = o + 8; i < n; i++) {
        let s = 0; for (let c = 0; c < kanal; c++, p += 2) s += v.getInt16(p, true);
        out[i] = s / kanal / 32768;
      }
      return { data: out, rate };
    }
    o += 8 + len + (len & 1);
  }
  return null;
}

/** Gabung semua kanal AudioBuffer menjadi satu Float32Array mono. */
export function keMono(audioBuffer) {
  const k = audioBuffer.numberOfChannels, n = audioBuffer.length;
  if (k === 1) return audioBuffer.getChannelData(0).slice();
  const out = new Float32Array(n);
  for (let c = 0; c < k; c++) { const d = audioBuffer.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / k; }
  return out;
}

// ================= FFT =================
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// ================= Analisa =================
/**
 * Analisa rekaman. Ambang "bagus" diambil dari rekaman uji 21 Nov 2026
 * (puncak -2,7 dB, bass 27-36%, kejelasan 18-24%).
 */
export function analisa(x, rate) {
  const n = x.length, h = { durasi: n / rate };
  if (n < rate / 2) return Object.assign(h, { pendek: true });

  let puncak = 0, jumlah = 0, pecah = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > puncak) puncak = a; jumlah += a * a; if (a >= 0.99) pecah++; }
  h.puncakDb = db(puncak); h.rataDb = db(Math.sqrt(jumlah / n)); h.persenPecah = 100 * pecah / n;

  // Level per 100 ms: bagian senyap, lantai derau, dan rentang dinamika
  const win = Math.floor(rate / 10), lv = [];
  for (let w = 0; w + win <= n; w += win) { let t = 0; for (let i = w; i < w + win; i++) t += x[i] * x[i]; lv.push(db(Math.sqrt(t / win))); }
  const urut = lv.slice().sort((a, b) => a - b), q = (p) => urut[Math.min(urut.length - 1, Math.floor(urut.length * p))];
  h.persenSenyap = 100 * lv.filter((v) => v < -50).length / Math.max(1, lv.length);
  h.lantaiDerauDb = q(0.1); h.levelMedianDb = q(0.5); h.levelP90Db = q(0.9); h.rentangDinamikaDb = q(0.9) - q(0.1);

  // Keseimbangan nada (FFT 4096, jendela Hann)
  const N = 4096, pita = [0, 0, 0, 0, 0], batas = [80, 300, 1200, 5000];
  const langkah = Math.max(N, Math.floor((n - N) / 300));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let off = 0; off + N <= n; off += langkah) {
    for (let i = 0; i < N; i++) { re[i] = x[off + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))); im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = k * rate / N, p = re[k] * re[k] + im[k] * im[k];
      pita[f < batas[0] ? 0 : f < batas[1] ? 1 : f < batas[2] ? 2 : f < batas[3] ? 3 : 4] += p;
    }
  }
  const tot = pita.reduce((a, b) => a + b, 0) || 1;
  [h.getaran, h.bass, h.badan, h.kejelasan, h.udara] = pita.map((p) => 100 * p / tot);
  return h;
}

/** Cari batas potong otomatis (0..1): lewati bagian senyap di awal dan akhir, sisakan jeda 0,5 detik. */
export function batasSenyap(x, rate) {
  const lv = [];
  for (let w = 0; w + rate <= x.length; w += rate) { let t = 0; for (let i = w; i < w + rate; i++) t += x[i] * x[i]; lv.push(db(Math.sqrt(t / rate))); }
  if (lv.length < 8) return { awal: 0, akhir: 1 };
  const urut = lv.slice().sort((a, b) => a - b), tipikal = urut[Math.floor(urut.length * 0.6)], ambang = tipikal - 10;
  let a = lv.findIndex((v) => v > ambang), b = lv.length - 1 - lv.slice().reverse().findIndex((v) => v > ambang);
  if (a < 0) return { awal: 0, akhir: 1 };
  const n = x.length / rate, awalDetik = Math.max(0, a - 0.5), akhirDetik = Math.min(n, b + 1.5);
  // hanya potong bila bagian senyapnya berarti (lebih dari 2 detik total)
  return awalDetik + (n - akhirDetik) < 2 ? { awal: 0, akhir: 1 } : { awal: awalDetik / n, akhir: akhirDetik / n };
}

/** Ringkasan analisa + saran setelan mixer dalam bahasa sehari-hari. */
export function nilaiAnalisa(h) {
  const r = { kartu: {}, saran: [] };
  if (h.pendek) { r.saran.push("Rekaman terlalu pendek untuk dianalisa."); return r; }
  r.kartu.pecah = h.persenPecah > 0.01 ? ["Ya", "Terlalu keras", false] : h.puncakDb > -1 ? ["Hampir", "Mepet batas", false] : ["Tidak", "Aman", true];
  r.kartu.senyap = [Math.round(h.persenSenyap) + "%", h.persenSenyap > 25 ? "Banyak jeda" : "Normal", h.persenSenyap <= 25];
  r.kartu.bass = [Math.round(h.bass) + "%", h.bass > 50 ? "Terlalu berat" : "Seimbang", h.bass <= 50];
  r.kartu.jelas = [Math.round(h.kejelasan) + "%", h.kejelasan < 10 ? "Kurang jelas" : "Jelas", h.kejelasan >= 10];

  if (h.persenPecah > 0.01) r.saran.push("Suara pecah: geser Volume input ke kiri 10, atau turunkan MAIN mixer sedikit. Lampu CLIP jangan sampai menyala.");
  else if (h.puncakDb > -1) r.saran.push("Hampir pecah: geser Volume input ke kiri 5 supaya aman saat bernyanyi keras.");
  else if (h.puncakDb < -12) r.saran.push("Terlalu pelan: geser Volume input ke kanan 10, lalu rekam ulang.");
  if (h.persenSenyap > 25) r.saran.push("Banyak bagian senyap: kalau lagunya tidak ada jeda, tekan semua colokan sampai masuk penuh.");
  if (h.bass > 50) r.saran.push("Terlalu berat: di CH2 mixer pastikan HPF ditekan, putar LOW ke kiri sedikit. Pegang mic 3–5 cm dari mulut.");
  if (h.kejelasan < 10) r.saran.push("Vokal kurang jelas: putar HIGH CH2 ke kanan sedikit, dan kecilkan volume musik 3/4 sedikit.");
  r.bagus = r.saran.length === 0;
  if (r.bagus) r.saran.push("Rekaman sudah bagus. Tidak ada yang perlu diubah di mixer.");
  return r;
}

/** Setelan efek otomatis dari hasil analisa (dipakai bila kunci Claude belum diatur). */
export function setelanOtomatis(h) {
  // Desis hanya terdengar di bagian sepi: lantai derau -62..-40 dB. Di atas itu musiknya tidak pernah sepi.
  const s = { desisAktif: h.lantaiDerauDb > -62 && h.lantaiDerauDb < -40, desis: h.lantaiDerauDb > -50 ? 60 : 40,
    penyeimbangAktif: true, penyeimbang: h.rentangDinamikaDb > 22 ? 60 : 35,
    eqAktif: true, eq: h.kejelasan < 6 ? 90 : h.kejelasan < 15 ? 70 : h.kejelasan > 22 ? 25 : h.bass > 45 ? 50 : 40,
    desisSAktif: h.udara > 6, gemaAktif: true, gema: h.kejelasan < 6 ? 14 : 20, keraskanAktif: true, nada: 0,
    kilauAktif: h.udara < 1.5, kilau: h.kejelasan > 22 ? 30 : h.udara < 0.5 ? 70 : 45,
    potongBass: h.bass > 55 ? 60 : h.bass > 45 ? 40 : h.bass > 38 ? 20 : 0 };
  const alasan = [];
  if (s.desisAktif) alasan.push("ada desis latar, jadi saya bersihkan");
  if (s.kilauAktif) alasan.push("nada tinggi rekaman terpotong, saya tambahkan kilau vokal");
  if (h.kejelasan < 6) alasan.push("vokal tenggelam oleh musik, saya majukan vokalnya");
  if (s.penyeimbang >= 60) alasan.push("naik-turun suaranya cukup besar, jadi penyeimbang saya kuatkan");
  if (s.eq >= 70) alasan.push(h.bass > 45 ? "bass terlalu tebal, saya rapikan" : "vokal kurang jernih, saya perjelas");
  s.pesan = alasan.length ? "Setelan otomatis: " + alasan.join(", ") + "." : "Setelan otomatis: rekaman sudah cukup bagus, saya beri sentuhan ringan.";
  return s;
}

export const PRESET = {
  natural: { desisAktif: true, desis: 30, penyeimbangAktif: true, penyeimbang: 25, eqAktif: true, eq: 30, desisSAktif: false, gemaAktif: true, gema: 12, keraskanAktif: true, kilauAktif: false, kilau: 20 },
  pop:     { desisAktif: true, desis: 40, penyeimbangAktif: true, penyeimbang: 45, eqAktif: true, eq: 55, desisSAktif: true, gemaAktif: true, gema: 22, keraskanAktif: true, kilauAktif: false, kilau: 35 },
  ballad:  { desisAktif: true, desis: 40, penyeimbangAktif: true, penyeimbang: 35, eqAktif: true, eq: 45, desisSAktif: true, gemaAktif: true, gema: 40, keraskanAktif: true, kilauAktif: false, kilau: 30 },
  rock:    { desisAktif: true, desis: 35, penyeimbangAktif: true, penyeimbang: 65, eqAktif: true, eq: 65, desisSAktif: false, gemaAktif: true, gema: 15, keraskanAktif: true, kilauAktif: false, kilau: 30 },
  dangdut: { desisAktif: true, desis: 40, penyeimbangAktif: true, penyeimbang: 50, eqAktif: true, eq: 50, desisSAktif: true, gemaAktif: true, gema: 30, keraskanAktif: true, kilauAktif: false, kilau: 30 },
};

// ================= Efek studio =================
/** Bersihkan desis: gerbang derau lembut berdasarkan lantai derau rekaman. */
function gerbangDerau(x, rate, jumlah) {
  const out = new Float32Array(x.length), win = Math.floor(rate * 0.02), lv = [];
  for (let w = 0; w + win <= x.length; w += win) { let t = 0; for (let i = w; i < w + win; i++) t += x[i] * x[i]; lv.push(Math.sqrt(t / win)); }
  const urut = lv.slice().sort((a, b) => a - b), lantai = urut[Math.floor(urut.length * 0.1)] || 0;
  // Lantai di atas -40 dB berarti musik terus berbunyi (tidak ada jeda berisi desis): jangan diubah.
  if (db(lantai) > -40) return x.slice();
  const ambang = Math.min(0.01, lantai * (2 + jumlah * 4)), rasio = 1 + jumlah * 3;
  const serang = Math.exp(-1 / (rate * 0.004)), lepas = Math.exp(-1 / (rate * 0.12));
  let env = 0, g = 1;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    env = a > env ? a + (env - a) * serang : a + (env - a) * lepas;
    const target = env >= ambang || env <= 0 ? 1 : Math.pow(env / ambang, rasio - 1);
    g = target > g ? target + (g - target) * serang : target + (g - target) * lepas;
    out[i] = x[i] * g;
  }
  return out;
}

/** Respons impuls gema ruang buatan (derau yang meluruh). */
function responsGema(ctx, rate, detik) {
  const n = Math.floor(rate * detik), ir = ctx.createBuffer(1, n, rate), d = ir.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
  return ir;
}

/** EQ, haluskan "s", penyeimbang, dan gema lewat OfflineAudioContext. */
async function rantaiWebAudio(x, rate, s) {
  const ctx = new OfflineAudioContext(1, x.length + Math.floor(rate * (s.gemaAktif ? 1.8 : 0)), rate);
  const buf = ctx.createBuffer(1, x.length, rate); buf.copyToChannel(x, 0);
  const src = ctx.createBufferSource(); src.buffer = buf;
  let simpul = src;
  const sambung = (n) => { simpul.connect(n); simpul = n; return n; };

  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 70; sambung(hp);
  if (s.eqAktif) {
    const e = s.eq / 100;
    const rendah = ctx.createBiquadFilter(); rendah.type = "peaking"; rendah.frequency.value = 250; rendah.Q.value = 0.9; rendah.gain.value = -6 * e; sambung(rendah);
    const jelas = ctx.createBiquadFilter(); jelas.type = "peaking"; jelas.frequency.value = 3000; jelas.Q.value = 0.8; jelas.gain.value = 7 * e; sambung(jelas);
    const udara = ctx.createBiquadFilter(); udara.type = "highshelf"; udara.frequency.value = 9000; udara.gain.value = 3 * e; sambung(udara);
  }
  if (s.kilauAktif && s.kilau > 0) {
    // Kilau vokal (exciter): membangun kembali nada tinggi yang hilang (misalnya converter yang terpotong di 8 kHz)
    const atas = ctx.createBiquadFilter(); atas.type = "highpass"; atas.frequency.value = 2500; atas.Q.value = 0.7;
    const dorong = ctx.createGain(); dorong.gain.value = 6;
    const jenuh = ctx.createWaveShaper(); const kurva = new Float32Array(2048);
    for (let i = 0; i < kurva.length; i++) { const v = (i / (kurva.length - 1)) * 2 - 1; kurva[i] = Math.tanh(v * 2.5); }
    jenuh.curve = kurva; jenuh.oversample = "4x";
    const kilap = ctx.createBiquadFilter(); kilap.type = "highpass"; kilap.frequency.value = 6000; kilap.Q.value = 0.7;
    const kilap2 = ctx.createBiquadFilter(); kilap2.type = "highpass"; kilap2.frequency.value = 6000; kilap2.Q.value = 0.7;
    const campur = ctx.createGain(); campur.gain.value = 0.4 * s.kilau / 100;
    const jumlah = ctx.createGain(); jumlah.gain.value = 1;
    simpul.connect(jumlah);
    simpul.connect(atas); atas.connect(dorong); dorong.connect(jenuh); jenuh.connect(kilap); kilap.connect(kilap2); kilap2.connect(campur); campur.connect(jumlah);
    simpul = jumlah;
  }
  if (s.potongBass > 0) {
    const pb = s.potongBass / 100;
    const lumpur = ctx.createBiquadFilter(); lumpur.type = "peaking"; lumpur.frequency.value = 180; lumpur.Q.value = 0.8; lumpur.gain.value = -7 * pb; sambung(lumpur);
    const dentum = ctx.createBiquadFilter(); dentum.type = "lowshelf"; dentum.frequency.value = 110; dentum.gain.value = -4 * pb; sambung(dentum);
  }
  if (s.desisSAktif) { const ds = ctx.createBiquadFilter(); ds.type = "peaking"; ds.frequency.value = 6500; ds.Q.value = 2; ds.gain.value = -6; sambung(ds); }
  if (s.penyeimbangAktif) {
    const c = s.penyeimbang / 100, k = ctx.createDynamicsCompressor();
    k.threshold.value = -12 - 20 * c; k.ratio.value = 2 + 4 * c; k.knee.value = 8; k.attack.value = 0.015; k.release.value = 0.35;
    sambung(k);
  }
  const keluar = ctx.createGain(); keluar.gain.value = 1;
  if (s.gemaAktif && s.gema > 0) {
    const kering = ctx.createGain(), basah = ctx.createGain(), konv = ctx.createConvolver();
    konv.buffer = responsGema(ctx, rate, 0.8 + s.gema / 100 * 1.6);
    kering.gain.value = 1; basah.gain.value = 0.35 * s.gema / 100;
    simpul.connect(kering); simpul.connect(konv); konv.connect(basah);
    kering.connect(keluar); basah.connect(keluar);
  } else simpul.connect(keluar);
  keluar.connect(ctx.destination);
  src.start();
  const hasil = await ctx.startRendering();
  return hasil.getChannelData(0).slice();
}

/** Geser nada tanpa mengubah tempo (resample + WSOLA). */
function geserNada(x, semitone) {
  if (!semitone) return x;
  const r = Math.pow(2, semitone / 12);
  // 1) Ubah kecepatan: nada naik/turun, durasi berubah 1/r
  const m = Math.floor(x.length / r), y = new Float32Array(m);
  for (let i = 0; i < m; i++) { const p = i * r, a = Math.floor(p), f = p - a; y[i] = (x[a] || 0) * (1 - f) + (x[a + 1] || 0) * f; }
  // 2) Kembalikan durasi dengan WSOLA (time-stretch faktor r)
  const N = 2048, H = N / 2, cari = 512, out = new Float32Array(x.length + N), bobot = new Float32Array(x.length + N);
  const jendela = new Float32Array(N); for (let i = 0; i < N; i++) jendela[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  let posIn = 0, prevAkhir = 0;
  for (let posOut = 0; posOut + N < out.length; posOut += H) {
    let mulai = Math.round(posOut / r);
    if (posOut > 0) {
      // cari geseran yang paling menyambung dengan potongan sebelumnya
      let terbaik = 0, skor = -Infinity;
      for (let d = -cari; d <= cari; d += 8) {
        const c = mulai + d; if (c < 0 || c + N >= m) continue;
        let s = 0; for (let i = 0; i < H; i += 4) s += y[c + i] * y[prevAkhir + i];
        if (s > skor) { skor = s; terbaik = d; }
      }
      mulai += terbaik;
    }
    if (mulai < 0 || mulai + N >= m) break;
    for (let i = 0; i < N; i++) { out[posOut + i] += y[mulai + i] * jendela[i]; bobot[posOut + i] += jendela[i]; }
    prevAkhir = mulai + H; posIn = mulai;
  }
  const hasil = new Float32Array(x.length);
  for (let i = 0; i < hasil.length; i++) hasil[i] = bobot[i] > 1e-3 ? out[i] / bobot[i] : 0;
  return hasil;
}

/**
 * Keraskan tanpa "memompa":
 * 1) Naikkan volume secukupnya: ke target rata-rata, tapi pembatas puncak hanya boleh bekerja
 *    paling banyak `maksTekanDb` (dulu tidak dibatasi, sehingga tiap pukulan drum volume ditekan dalam-dalam).
 * 2) Pembatas puncak di -1 dB dengan lookahead 10 ms (gain turun pelan sebelum puncak datang)
 *    dan lepas 400 ms (dulu 80 ms) supaya tidak terdengar naik-turun mengikuti ketukan.
 */
function keraskan(x, rate, targetDb = -15, maksTekanDb = 6) {
  const n = x.length; if (!n) return new Float32Array(0);
  let jum = 0, puncak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); jum += x[i] * x[i]; if (a > puncak) puncak = a; }
  const rms = Math.sqrt(jum / n), batas = Math.pow(10, -1 / 20);
  if (rms <= 0 || puncak <= 0) return x.slice();
  const naikTarget = Math.pow(10, targetDb / 20) / rms;
  const naikMaks = (batas / puncak) * Math.pow(10, maksTekanDb / 20);
  const naik = Math.max(0.05, Math.min(16, naikTarget, naikMaks));

  // Gain yang dibutuhkan tiap sampel agar tidak melewati batas
  const L = Math.max(1, Math.floor(rate * 0.010)), L2 = 2 * L;
  const perlu = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.abs(x[i]) * naik; perlu[i] = a > batas ? batas / a : 1; }
  // Minimum bergerak ke depan (lookahead) dengan deque monoton
  const minDepan = new Float32Array(n), dq = new Int32Array(n); let kepala = 0, ekor = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (ekor > kepala && perlu[dq[ekor - 1]] >= perlu[i]) ekor--;
    dq[ekor++] = i;
    while (dq[kepala] > i + L2) kepala++;
    minDepan[i] = perlu[dq[kepala]];
  }
  // Haluskan: turun lewat rata-rata bergerak (tanpa klik), naik dengan lepas 400 ms
  const lepas = Math.exp(-1 / (rate * 0.4)), out = new Float32Array(n);
  let jumlahJendela = 0; const jendela = new Float32Array(L).fill(1); let idx = 0; jumlahJendela = L;
  let g = 1;
  for (let i = 0; i < n; i++) {
    jumlahJendela += minDepan[i] - jendela[idx]; jendela[idx] = minDepan[i]; idx = (idx + 1) % L;
    const halus = jumlahJendela / L;
    g = halus < g ? halus : halus + (g - halus) * lepas;
    const v = x[i] * naik * g;
    out[i] = v > batas ? batas : v < -batas ? -batas : v;
  }
  return out;
}

/** Keraskan rekaman mentah ke level pas (rata-rata -18 dB) tanpa pecah. Dipakai "Keraskan otomatis saat merekam". */
export function keraskanRekaman(x, rate) { return keraskan(saringDengung(x, rate), rate, -18, 3); }

/** Buang dengung/getaran di bawah ±30 Hz (dan DC) yang memboroskan ruang volume. High-pass 2 tingkat (12 dB/oktaf). */
export function saringDengung(x, rate) {
  const f = 30, w = Math.tan(Math.PI * f / rate), q = Math.SQRT1_2, n = 1 / (1 + w / q + w * w);
  const b0 = n, b1 = -2 * n, b2 = n, a1 = 2 * (w * w - 1) * n, a2 = (1 - w / q + w * w) * n;
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; }
  return y;
}

/** Pastikan tidak ada yang melewati batas (dipakai bila "Keraskan akhir" mati). */
function amankan(x) {
  let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  if (p > 0.98) { const g = 0.98 / p; for (let i = 0; i < x.length; i++) x[i] *= g; }
  return x;
}

/** Potong awal/akhir lalu beri fade 0,3 detik supaya tidak ada bunyi klik. */
export function potong(x, rate, awal, akhir) {
  const a = Math.max(0, Math.floor(awal * x.length)), b = Math.min(x.length, Math.ceil(akhir * x.length));
  const y = x.slice(a, Math.max(a + 1, b)), f = Math.min(Math.floor(rate * 0.3), Math.floor(y.length / 4));
  for (let i = 0; i < f; i++) { const g = i / f; y[i] *= g; y[y.length - 1 - i] *= g; }
  return y;
}

/**
 * Jalankan seluruh rantai studio.
 * @param {Float32Array} x  rekaman asli (mono)
 * @param {object} s  setelan efek (desisAktif, desis, penyeimbangAktif, ...)
 * @param {number} awal,akhir  batas potong 0..1
 */
export async function prosesStudio(x, rate, s, awal = 0, akhir = 1) {
  let y = potong(x, rate, awal, akhir);
  if (s.desisAktif && s.desis > 0) y = gerbangDerau(y, rate, s.desis / 100);
  if (s.nada) y = geserNada(y, s.nada);
  y = await rantaiWebAudio(y, rate, s);
  y = s.keraskanAktif ? keraskan(y, rate) : amankan(y);
  return y;
}
