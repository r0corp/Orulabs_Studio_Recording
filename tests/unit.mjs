// Tes unit mesin suara (tanpa browser): node tests/unit.mjs
// Memakai sinyal buatan saja, tidak membaca rekaman pengguna.
import * as dsp from "../web/dsp.js";
import * as magic from "../web/magic.js";

let gagal = 0;
const cek = (nama, ok, info = "") => { console.log((ok ? "  ✓ " : "  ✗ ") + nama + (info ? "  (" + info + ")" : "")); if (!ok) gagal++; };
const R = 48000;
const sinus = (f, detik, amp = 0.4) => { const x = new Float32Array(Math.round(R * detik)); for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * f * i / R); return x; };
const snr = (a, b) => { let s = 0, e = 0; for (let i = 0; i < a.length; i++) { s += a[i] ** 2; e += (a[i] - b[i]) ** 2; } return e === 0 ? Infinity : 10 * Math.log10(s / e); };
const median = (a) => { const b = Array.from(a).filter((v) => v > 0).sort((p, q) => p - q); return b[Math.floor(b.length / 2)]; };

console.log("WAV");
{
  const x = sinus(440, 1), w = dsp.bacaWav(await dsp.keWav(x, R).arrayBuffer());
  cek("mono tulis-baca", w && w.rate === R && snr(x, w.data) > 80, snr(x, w.data).toFixed(0) + " dB");
  const L = sinus(440, 1), Rk = sinus(660, 1, 0.2), s = dsp.bacaWav(await dsp.keWav([L, Rk], R).arrayBuffer());
  cek("stereo tulis-baca", s && s.kanal && snr(L, s.kanal[0]) > 70 && snr(Rk, s.kanal[1]) > 70);
}

console.log("Kalibrasi sinkron (ukurJeda)");
{
  const n = R * 5, buat = (jeda, derau, redam) => {
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let k = 0; k < 8; k++) { const s = Math.round((0.6 + k * 0.45) * R); for (let i = 0; i < 192; i++) { const v = (Math.random() * 2 - 1) * 0.9 * (1 - i / 192); a[s + i] = v; const t = s + i + Math.round(jeda * R / 1000); if (t < n) b[t] += v * redam; } }
    for (let i = 0; i < n; i++) b[i] += (Math.random() * 2 - 1) * derau + 0.05 * Math.sin(2 * Math.PI * 60 * i / R);
    return [a, b];
  };
  for (const j of [30, 183, 420]) { const h = dsp.ukurJeda(...buat(j, 0.02, 0.1), R); cek("jeda " + j + " ms terukur tepat", h && Math.abs(h.ms - j) <= 1, h ? h.ms + " ms" : "tidak yakin"); }
  cek("tanpa bunyi tik: menolak menebak", dsp.ukurJeda(...buat(183, 0.05, 0), R) === null);
}

console.log("Magic Vocal");
{
  const n = R * 2, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * (2 * ((i * 220 / R) % 1) - 1);
  const lac = await magic.lacakNada(x, R);
  cek("lacak nada 220 Hz", Math.abs(median(lac.f0) - 220) < 1, median(lac.f0).toFixed(1) + " Hz");
  const nol = await magic.terapkanKoreksi(x, R, lac, { koreksi: new Float32Array(lac.f0.length) });
  cek("tanpa koreksi = identik dengan asli", snr(x, nol) > 60, snr(x, nol).toFixed(0) + " dB");
  const naik = await magic.terapkanKoreksi(x, R, lac, { koreksi: new Float32Array(lac.f0.length).fill(1) });
  const f2 = median((await magic.lacakNada(naik, R)).f0);
  cek("naik 1 semitone", Math.abs(f2 - 233.08) < 1.5, f2.toFixed(1) + " Hz");
  // nada bergoyang (vibrato) di sekitar nada sedikit fals: koreksi tidak boleh meloncat
  const y = new Float32Array(R * 3); let fase = 0;
  for (let i = 0; i < y.length; i++) { const f = 226 * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * i / R)); fase += f / R; y[i] = 0.3 * (2 * (fase % 1) - 1); }
  const ly = await magic.lacakNada(y, R), ren = magic.rencanaKoreksi(ly, { tonik: 7, mayor: true }, 0.85, 0.06);
  let loncat = 0; for (let i = 1; i < ren.koreksi.length; i++) if (Math.abs(ren.koreksi[i] - ren.koreksi[i - 1]) > 0.25) loncat++;
  cek("koreksi tanpa loncatan mendadak", loncat === 0, loncat + " loncatan");
  cek("fals berkurang", ren.stat.falsSesudah < ren.stat.falsSebelum, ren.stat.falsSebelum + " → " + ren.stat.falsSesudah + " sen");
}

console.log("Pembersih pegangan mic");
{
  const n = R * 3, z = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = 0.25 * Math.sin(2 * Math.PI * 220 * i / R) + 0.15 * Math.sin(2 * Math.PI * 110 * i / R) + 0.08 * Math.sin(2 * Math.PI * 1760 * i / R);
  cek("suara bersih tidak berubah", snr(z, dsp.bersihkanPegangan(z, R)) > 80);
  const t = z.slice(); const s0 = R; for (let i = 0; i < 2400; i++) t[s0 + i] += 1.4 * Math.sin(2 * Math.PI * 45 * i / R) * Math.exp(-i / 2400); // dentuman pegangan: nada sangat rendah ±12 dB di atas suara, luruh ±50 ms
  const b = dsp.bersihkanPegangan(t, R); let e1 = 0, e2 = 0; for (let i = s0; i < s0 + 2400; i++) { e1 += (t[i] - z[i]) ** 2; e2 += (b[i] - z[i]) ** 2; }
  cek("dentuman diredam", e2 < e1 * 0.3, (10 * Math.log10(e1 / e2)).toFixed(1) + " dB lebih kecil");
}

console.log("Campur 2 jalur stereo");
{
  const L = sinus(440, 2, 0.5), Rk = sinus(660, 2, 0.25), v = sinus(220, 2, 0.3);
  const [oL, oR] = dsp.campurJalurStereo(v, L, Rk, R, { volV: 1, volM: 1, geserMs: 0, awal: 0, akhir: 1, panjangAsli: v.length });
  const rms = (a) => Math.sqrt(a.reduce((s, q) => s + q * q, 0) / a.length);
  let puncak = 0; for (let i = 0; i < oL.length; i++) puncak = Math.max(puncak, Math.abs(oL[i]), Math.abs(oR[i]));
  cek("tidak pecah", puncak <= 0.9, (20 * Math.log10(puncak)).toFixed(1) + " dB");
  cek("kiri lebih keras dari kanan (sesuai musik)", rms(oL) > rms(oR));
}

console.log("Ringkasan level");
{
  const x = sinus(300, 10, 0.25), L = dsp.ringkasLevel(x, R);
  cek("−12 dB = zona ideal", L && L.ideal === 100 && L.bahaya === 0, L && L.ideal + "%");
}

console.log(gagal ? "\n" + gagal + " tes GAGAL" : "\nSemua tes unit lolos");
process.exit(gagal ? 1 : 0);
