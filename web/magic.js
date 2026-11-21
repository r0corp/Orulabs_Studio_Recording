// Magic Vocal: baca kunci lagu dari jalur musik, lacak nada vokal, koreksi nada (PSOLA),
// dan setarakan dinamika vokal. Semua dikerjakan di laptop, tanpa internet.
// Fungsi berat dipecah per potongan dan memanggil `tiapPotong` supaya tampilan tetap hidup dan bisa menampilkan kemajuan.

const NAMA_NADA = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NAMA_NADA_ID = { mayor: "mayor", minor: "minor" };
// Profil kunci Krumhansl-Kessler (seberapa sering tiap nada muncul dalam kunci mayor/minor)
const PROFIL_MAYOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PROFIL_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const SKALA_MAYOR = [0, 2, 4, 5, 7, 9, 11], SKALA_MINOR = [0, 2, 3, 5, 7, 8, 10];

const jeda = () => new Promise((r) => setTimeout(r, 0));

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const p = i + j, q = p + len / 2, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}

/** Baca kunci lagu dari jalur musik (kromagram + profil Krumhansl). */
export async function deteksiKunci(musik, rate) {
  const F = 8192, hop = F * 2, kroma = new Float64Array(12), win = new Float32Array(F);
  for (let i = 0; i < F; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / F);
  const re = new Float64Array(F), im = new Float64Array(F);
  let hitung = 0;
  for (let w = 0; w + F <= musik.length; w += hop) {
    for (let i = 0; i < F; i++) { re[i] = musik[w + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = Math.ceil(70 * F / rate); k < Math.min(F / 2, 2000 * F / rate); k++) {
      const f = k * rate / F, mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const kelas = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12; // A=9
      kroma[kelas] += mag;
    }
    if (++hitung % 20 === 0) await jeda();
  }
  const korelasi = (prof, tonik) => {
    let mx = 0, my = 0; for (let i = 0; i < 12; i++) { mx += kroma[(i + tonik) % 12]; my += prof[i]; } mx /= 12; my /= 12;
    let a = 0, b = 0, c = 0; for (let i = 0; i < 12; i++) { const x = kroma[(i + tonik) % 12] - mx, y = prof[i] - my; a += x * y; b += x * x; c += y * y; }
    return a / Math.sqrt(b * c || 1);
  };
  let terbaik = { r: -2 };
  for (let t = 0; t < 12; t++) for (const [mayor, prof] of [[true, PROFIL_MAYOR], [false, PROFIL_MINOR]]) {
    const r = korelasi(prof, t); if (r > terbaik.r) terbaik = { r, tonik: t, mayor };
  }
  return { tonik: terbaik.tonik, mayor: terbaik.mayor, yakin: terbaik.r, nama: NAMA_NADA[terbaik.tonik] + " " + (terbaik.mayor ? NAMA_NADA_ID.mayor : NAMA_NADA_ID.minor) };
}

/**
 * Lacak nada vokal (YIN) tiap 10 ms. Sinyal diturunkan ke ±16 kHz supaya cepat.
 * Hasil: { hop (detik), f0: Float32Array (0 = tidak bernada) }.
 */
export async function lacakNada(x, rate, tiapPotong) {
  const turun = Math.max(1, Math.floor(rate / 16000)), r = rate / turun;
  const n = Math.floor(x.length / turun), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < turun; k++) s += x[i * turun + k]; y[i] = s / turun; }
  const W = 640, hop = Math.round(r / 100), tauMin = Math.floor(r / 900), tauMaks = Math.ceil(r / 75);
  const jumlah = Math.floor((n - W - tauMaks) / hop), f0 = new Float32Array(Math.max(0, jumlah));
  const d = new Float32Array(tauMaks + 1);
  // ambang keras: abaikan bagian yang lebih dari 35 dB di bawah bagian terkeras
  let puncak = 0; for (let i = 0; i < n; i++) puncak = Math.max(puncak, Math.abs(y[i]));
  const ambangRms = puncak * 0.018;
  for (let f = 0; f < jumlah; f++) {
    const a = f * hop;
    let e = 0; for (let i = 0; i < W; i++) e += y[a + i] * y[a + i];
    if (Math.sqrt(e / W) < ambangRms) { f0[f] = 0; continue; }
    // fungsi selisih + normalisasi kumulatif (YIN)
    d[0] = 1; let jum = 0, tau = -1;
    for (let t = 1; t <= tauMaks; t++) {
      let s = 0; for (let i = 0; i < W; i++) { const v = y[a + i] - y[a + i + t]; s += v * v; }
      jum += s; d[t] = s * t / (jum || 1);
      if (t > tauMin && tau < 0 && d[t] < 0.15) { tau = t; }
      if (tau > 0 && t > tau + 2) break;
    }
    if (tau < 0) { f0[f] = 0; continue; }
    while (tau + 1 <= tauMaks && d[tau + 1] < d[tau]) tau++;
    const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1] ?? s1, geser = (s2 - s0) / (2 * (2 * s1 - s2 - s0) || 1);
    f0[f] = r / (tau + (Math.abs(geser) < 1 ? geser : 0));
    if (f % 400 === 0) { tiapPotong && tiapPotong(f / jumlah); await jeda(); }
  }
  // buang loncatan satu-dua bingkai (oktaf salah) dengan median 5
  const hasil = f0.slice();
  for (let i = 2; i < f0.length - 2; i++) { if (!f0[i]) continue; const w = [f0[i - 2], f0[i - 1], f0[i], f0[i + 1], f0[i + 2]].filter((v) => v > 0).sort((p, q) => p - q); if (w.length >= 3) hasil[i] = w[Math.floor(w.length / 2)]; }
  // salah baca oktaf: nada yang berbeda lebih dari 7 semitone dari median sekitarnya dianggap tidak bernada
  const bersih = hasil.slice();
  for (let i = 0; i < hasil.length; i++) {
    if (!hasil[i]) continue;
    const w = []; for (let k = i - 15; k <= i + 15; k++) if (k >= 0 && k < hasil.length && hasil[k]) w.push(hasil[k]);
    w.sort((p, q) => p - q); const med = w[Math.floor(w.length / 2)];
    if (Math.abs(12 * Math.log2(hasil[i] / med)) > 7) bersih[i] = 0;
  }
  return { hop: hop / r, f0: bersih };
}

const keMidi = (f) => 69 + 12 * Math.log2(f / 440);

/** Nada terdekat di skala kunci (dalam satuan midi, boleh pecahan masuk, keluaran bulat). */
function nadaSkala(m, kunci) {
  const skala = kunci.mayor ? SKALA_MAYOR : SKALA_MINOR, dasar = Math.round(m);
  let terbaik = dasar, jarak = 99;
  for (let k = dasar - 2; k <= dasar + 2; k++) { const kelas = ((k - kunci.tonik) % 12 + 12) % 12; if (skala.includes(kelas) && Math.abs(k - m) < jarak) { jarak = Math.abs(k - m); terbaik = k; } }
  return terbaik;
}

/**
 * Hitung koreksi nada per bingkai (semitone, + = naikkan).
 * kekuatan 0..1. cepat (detik) = waktu perpindahan koreksi; 0 = efek autotune (tiap bingkai langsung ke nada benar).
 * Selain efek autotune, koreksi dihitung dari NADA TENGAH tiap not (rata-rata ±75 ms), sehingga vibrato,
 * liukan, dan ekspresi penyanyi tetap utuh; yang digeser hanya posisi not yang meleset.
 */
export function rencanaKoreksi(lacak, kunci, kekuatan, cepat) {
  const { f0, hop } = lacak, n = f0.length, koreksi = new Float32Array(n), target = new Float32Array(n), asli = new Float32Array(n), tengah = new Float32Array(n);
  for (let i = 0; i < n; i++) if (f0[i]) asli[i] = keMidi(f0[i]);
  // nada tengah: median nada bernada dalam ±75 ms
  const R = Math.max(2, Math.round(0.075 / hop));
  for (let i = 0; i < n; i++) {
    if (!asli[i]) continue;
    const w = []; for (let k = i - R; k <= i + R; k++) if (k >= 0 && k < n && asli[k]) w.push(asli[k]);
    w.sort((p, q) => p - q); tengah[i] = w[Math.floor(w.length / 2)];
  }
  const efekAutotune = cepat <= 0;
  const dasar = efekAutotune ? asli : tengah;
  // nada target dengan histeresis: pindah not hanya bila nada tengah jelas menjauh (> 0,6 semitone) dari not sebelumnya
  for (let i = 0; i < n; i++) {
    if (!asli[i]) continue;
    const calon = nadaSkala(dasar[i], kunci);
    target[i] = i && target[i - 1] && Math.abs(dasar[i] - target[i - 1]) < 0.6 ? target[i - 1] : calon;
  }
  const a = efekAutotune ? 1 : 1 - Math.exp(-hop / cepat), aMasuk = 1 - Math.exp(-hop / 0.06);
  let k = 0, lamaBernada = 0;
  for (let i = 0; i < n; i++) {
    if (!asli[i]) { k += (0 - k) * aMasuk; koreksi[i] = Math.abs(k) < 0.005 ? 0 : k; lamaBernada = 0; continue; }
    let ingin = (target[i] - dasar[i]) * kekuatan;
    if (!efekAutotune) {
      // selisih besar biasanya disengaja (liukan, nada blues): kurangi koreksinya, maks ±0,8 semitone
      const d = Math.abs(target[i] - dasar[i]); if (d > 0.5) ingin *= Math.max(0.3, 1 - (d - 0.5) / 0.6);
      ingin = Math.max(-0.8, Math.min(0.8, ingin));
    }
    // awal frasa: koreksi masuk perlahan (±60 ms) supaya tidak ada "klik" nada
    const laju = efekAutotune ? 1 : lamaBernada < Math.round(0.06 / hop) ? Math.min(a, aMasuk) : a;
    k += (ingin - k) * laju; koreksi[i] = k; lamaBernada++;
  }
  // statistik: sen = 1/100 semitone (dinilai dari nada tengah supaya vibrato tidak dihitung sebagai fals)
  let n1 = 0, tepat = 0, sebelum = 0, sesudah = 0, nadaDikoreksi = 0, diNada = false;
  for (let i = 0; i < n; i++) {
    if (!asli[i]) { diNada = false; continue; }
    const dev = Math.abs(tengah[i] - target[i]) * 100, dev2 = Math.abs(tengah[i] + koreksi[i] - target[i]) * 100;
    n1++; sebelum += dev; sesudah += dev2; if (dev <= 20) tepat++;
    if (!diNada || target[i] !== target[i - 1]) { if (dev > 20) nadaDikoreksi++; diNada = true; }
  }
  return { koreksi, target, asli, hop, stat: { tepat: n1 ? Math.round(tepat / n1 * 100) : 0, falsSebelum: n1 ? Math.round(sebelum / n1) : 0, falsSesudah: n1 ? Math.round(sesudah / n1) : 0, nadaDikoreksi } };
}

/**
 * Geser nada mengikuti rencana koreksi dengan TD-PSOLA (durasi tetap sama).
 * - Tanda analisa dicari berkesinambungan pada sinyal yang dihaluskan (sejajar getaran pita suara).
 * - Tanda sintesis maju sebesar jarak tanda analisa / rasio: tanpa koreksi, butir kembali ke tempat asalnya (identik).
 * - Bagian yang tidak dikoreksi memakai suara asli; perpindahan asli <-> hasil koreksi memakai crossfade 20 ms.
 */
export async function terapkanKoreksi(x, rate, lacak, rencana, tiapPotong) {
  const { f0, hop } = lacak, { koreksi } = rencana, n = x.length;
  const bingkai = (t) => Math.min(f0.length - 1, Math.max(0, Math.floor(t / rate / hop)));
  const rasioDi = (t) => Math.pow(2, koreksi[bingkai(t)] / 12);
  // sinyal dihaluskan (low-pass ±1 kHz) untuk mencari puncak getaran yang konsisten
  const halus = new Float32Array(n), al = 1 - Math.exp(-2 * Math.PI * 1000 / rate);
  let lp = 0; for (let i = 0; i < n; i++) { lp += (x[i] - lp) * al; halus[i] = lp; }
  // tanda analisa
  const tanda = []; let t = 0;
  while (t < n) {
    const f = f0[bingkai(t)];
    if (f) {
      const P = rate / f, dari = Math.round(t + (tanda.length ? 0.8 * P : 0) - (tanda.length ? P : 0)), sampai = Math.round(t + (tanda.length ? 1.2 * P : P) - (tanda.length ? P : 0));
      let terbaik = Math.round(t), nilai = -Infinity;
      for (let k = Math.max(dari, tanda.length ? tanda[tanda.length - 1] + 1 : 0); k <= Math.min(n - 1, sampai); k++) if (halus[k] > nilai) { nilai = halus[k]; terbaik = k; }
      tanda.push(terbaik); t = terbaik + P;
    } else { tanda.push(Math.round(t)); t += rate * 0.005; }
  }
  if (tanda.length < 3) return x.slice();
  const periode = (j) => Math.max(16, Math.round(((tanda[Math.min(tanda.length - 1, j + 1)] - tanda[Math.max(0, j - 1)]) / 2) || rate * 0.005));
  // sintesis
  const y = new Float32Array(n), bobot = new Float32Array(n);
  let ts = tanda[0], j = 0, langkah = 0;
  while (ts < n) {
    while (j + 1 < tanda.length && Math.abs(tanda[j + 1] - ts) <= Math.abs(tanda[j] - ts)) j++;
    const pusat = tanda[j], P = periode(j), L = 2 * P, d0 = Math.round(ts);
    for (let k = -P; k < P; k++) {
      const s = pusat + k, d = d0 + k; if (s < 0 || s >= n || d < 0 || d >= n) continue;
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (k + P) / L);
      y[d] += x[s] * w; bobot[d] += w;
    }
    ts += (tanda[Math.min(tanda.length - 1, j + 1)] - pusat || P) / rasioDi(pusat);
    if (++langkah % 4000 === 0) { tiapPotong && tiapPotong(ts / n); await jeda(); }
  }
  for (let i = 0; i < n; i++) y[i] = bobot[i] > 0.05 ? y[i] / Math.max(bobot[i], 0.5) : x[i];
  // pakai suara asli di bagian yang tidak dikoreksi (crossfade 20 ms)
  const out = new Float32Array(n), cf = Math.round(rate * 0.02);
  let campur = 0;
  for (let i = 0; i < n; i++) {
    const perlu = Math.abs(koreksi[bingkai(i)]) > 0.01 ? 1 : 0;
    campur += perlu > campur ? 1 / cf : perlu < campur ? -1 / cf : 0; campur = Math.max(0, Math.min(1, campur));
    out[i] = x[i] * (1 - campur) + y[i] * campur;
  }
  return out;
}

/** Penyetara dinamika: bagian bernyanyi yang pelan dinaikkan, yang keras diturunkan (maks ±6 dB), sela sunyi dibiarkan. */
export function setarakanDinamika(x, rate) {
  const win = Math.floor(rate / 20), lv = [];
  for (let w = 0; w + win <= x.length; w += win) { let s = 0; for (let i = w; i < w + win; i++) s += x[i] * x[i]; lv.push(Math.sqrt(s / win)); }
  if (lv.length < 10) return x.slice();
  const urut = lv.slice().sort((a, b) => b - a), atas = urut[Math.floor(urut.length * 0.05)], aktif = lv.filter((v) => v > atas * 0.1).sort((a, b) => a - b);
  const sasaran = aktif[Math.floor(aktif.length * 0.6)] || atas * 0.5;
  const gainWin = lv.map((v) => v > atas * 0.1 ? Math.max(0.5, Math.min(2, sasaran / v)) : 1);
  // haluskan ±300 ms supaya tidak memompa
  const halus = gainWin.map((_, i) => { let s = 0, c = 0; for (let k = i - 6; k <= i + 6; k++) if (k >= 0 && k < gainWin.length) { s += gainWin[k]; c++; } return s / c; });
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { const p = i / win - 0.5, a = Math.max(0, Math.min(halus.length - 1, Math.floor(p))), b = Math.min(halus.length - 1, a + 1), f = Math.max(0, Math.min(1, p - a)); y[i] = x[i] * (halus[a] * (1 - f) + halus[b] * f); }
  return y;
}

export const NADA = NAMA_NADA;
export { SKALA_MAYOR, SKALA_MINOR };
