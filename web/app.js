// Orulabs Studio Recording: logika tampilan.
// YouTube (pemutar resmi, kolom seperti YouTube asli) + perekam + rekaman + studio + analisa + pengaturan.
import * as dsp from "./dsp.js";
import * as magic from "./magic.js";
import * as ekspor from "./ekspor.js";
import { t, aturBahasa, terapkan } from "./i18n.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const html = document.documentElement;

// ================= Bantuan umum =================
async function api(rute, opsi = {}) {
  const r = await fetch("/api/" + rute, { ...opsi, headers: { "X-Orulab": "1", ...(opsi.headers || {}) } });
  if (!r.ok) {
    let pesan = "HTTP " + r.status;
    try { const j = await r.json(); if (j.galat) pesan = j.galat; } catch {}
    throw new Error(pesan);
  }
  return r;
}
async function apiJson(rute, opsi) {
  const j = await (await api(rute, opsi)).json();
  if (j && j.galat) throw new Error(j.galat);
  return j;
}
const q = (o) => new URLSearchParams(o).toString();
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
function waktu(d) { d = Math.max(0, Math.floor(d || 0)); return String(Math.floor(d / 60)).padStart(2, "0") + ":" + String(d % 60).padStart(2, "0"); }
function cap(d) { const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + "." + p(d.getMinutes()) + "." + p(d.getSeconds()); }
function tundaan(fn, ms) { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const durasiYt = (d) => (d || "").replace(/\./g, ":");

let toastTimer;
function toast(teks, galat = false) {
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); document.body.appendChild(el); }
  el.className = "toast glass" + (galat ? " galat" : "");
  el.innerHTML = '<i class="bi ' + (galat ? "bi-exclamation-circle-fill" : "bi-check-circle-fill") + '"></i><span></span>';
  el.querySelector("span").textContent = teks;
  el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), galat ? 6000 : 3200);
}

/** Dialog kaca. Mengembalikan isi input (atau true) bila OK, null bila batal. */
function dialog({ judul, teks = "", input = null, ok = "OK", bahaya = false }) {
  return new Promise((selesai) => {
    const latar = document.createElement("div"); latar.className = "modal-latar";
    latar.innerHTML = '<div class="modal glass"><h3></h3><p></p>' + (input !== null ? '<input type="text">' : "") +
      '<div class="aksi"><button class="btn" data-a="batal"></button><button class="btn ' + (bahaya ? "bahaya" : "primary") + '" data-a="ok"></button></div></div>';
    latar.querySelector("h3").textContent = judul; latar.querySelector("p").textContent = teks;
    latar.querySelector('[data-a="ok"]').textContent = ok; latar.querySelector('[data-a="batal"]').textContent = t("batal");
    const inp = latar.querySelector("input"); if (inp) inp.value = input;
    const tutup = (v) => { latar.remove(); selesai(v); };
    latar.addEventListener("click", (e) => { if (e.target === latar) tutup(null); });
    latar.querySelector('[data-a="batal"]').onclick = () => tutup(null);
    latar.querySelector('[data-a="ok"]').onclick = () => tutup(inp ? inp.value : true);
    latar.addEventListener("keydown", (e) => { if (e.key === "Enter") tutup(inp ? inp.value : true); if (e.key === "Escape") tutup(null); });
    document.body.appendChild(latar);
    (inp || latar.querySelector('[data-a="ok"]')).focus(); if (inp) inp.select();
  });
}

// ================= Pengaturan =================
const EFEK_AWAL = { ...dsp.PRESET.pop, nada: 0 };
const P = {
  warna: "biru", mode: "glass-dark", bahasa: "id", preset: "pop", efek: { ...EFEK_AWAL },
  modeAudio: "rumah", volPutar: 100, sampingTutup: false, modeKerja: "rekam", duaJalur: true, mixVokal: 100, mixMusik: 100, fokusVokal: 0, mixRekaman: {}, vokalSaja: {}, keraskanOto: true, autoplay: true, sinkronYt: true,
  profil: { rumah: { input: "", output: "", putar: "" }, laptop: { input: "", output: "", putar: "" } },
};
const simpanPengaturan = tundaan(() => api("pengaturan", { method: "POST", body: JSON.stringify(P) }).catch(() => {}), 500);

const mqGelap = matchMedia("(prefers-color-scheme: dark)");
function terapkanTema() {
  html.setAttribute("data-warna", P.warna);
  html.setAttribute("data-ol-skin", P.mode === "auto" ? (mqGelap.matches ? "glass-dark" : "glass-light") : P.mode);
  $$("#warna button").forEach((b) => b.classList.toggle("on", b.dataset.w === P.warna));
  $$("#tema button").forEach((b) => b.classList.toggle("on", b.dataset.m === P.mode));
  $$("#bahasa button").forEach((b) => b.classList.toggle("on", b.dataset.l === P.bahasa));
  $("#swKeraskan").classList.toggle("off", !P.keraskanOto);
  $("#swAutoplay").classList.toggle("off", !P.autoplay);
  $("#swSinkron").classList.toggle("off", !P.sinkronYt);
  $("#swDuaJalur").classList.toggle("off", !P.duaJalur);
  gambarGelombang();
}
mqGelap.addEventListener("change", () => { if (P.mode === "auto") terapkanTema(); });
$$("#warna button").forEach((b) => (b.onclick = () => { P.warna = b.dataset.w; terapkanTema(); simpanPengaturan(); }));
$$("#tema button").forEach((b) => (b.onclick = () => { P.mode = b.dataset.m; terapkanTema(); simpanPengaturan(); }));
$$("#bahasa button").forEach((b) => (b.onclick = () => { P.bahasa = b.dataset.l; aturBahasa(P.bahasa); terapkanTema(); segarkanTeks(); simpanPengaturan(); }));
$("#swKeraskan").onclick = () => { P.keraskanOto = !P.keraskanOto; terapkanTema(); simpanPengaturan(); };
$("#swDuaJalur").onclick = () => { P.duaJalur = !P.duaJalur; terapkanTema(); simpanPengaturan(); };
$("#swSinkron").onclick = () => { P.sinkronYt = !P.sinkronYt; terapkanTema(); simpanPengaturan(); };
$("#swAutoplay").onclick = () => { P.autoplay = !P.autoplay; terapkanTema(); tampilkanKolom(); simpanPengaturan(); };

// Laci Pengaturan
const laci = $("#laci");
function bukaPengaturan() { laci.classList.add("buka"); isiPengaturanAudio(); }
$("#btnPengaturan").onclick = bukaPengaturan;
$("#tutupPengaturan").onclick = () => laci.classList.remove("buka");
laci.addEventListener("click", (e) => { if (e.target === laci) laci.classList.remove("buka"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") laci.classList.remove("buka"); });

// Tab Studio / Analisa
$$(".tabs button").forEach((b) => (b.onclick = () => {
  $$(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $$(".pane").forEach((p) => p.classList.toggle("on", p.id === b.dataset.tab));
}));

function isiSlider(r) { r.style.setProperty("--v", ((r.value - r.min) / (r.max - r.min)) * 100 + "%"); }
$$("input[type=range]").forEach((r) => { isiSlider(r); r.addEventListener("input", () => isiSlider(r)); });

// ================= Mode audio (Studio Rumah / Laptop) =================
// Nama perangkat dari browser kadang berbeda sedikit dengan Windows, misalnya "Default - ..." atau akhiran "(001f:0b21)".
const bersihNama = (label) => (label || "").replace(/^(Default|Communications|Bawaan|Komunikasi)\s*-\s*/i, "").replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "").trim();
const cocok = (label, nama) => !!nama && bersihNama(label).toLowerCase() === nama.toLowerCase();
let AUDIO = { output: [], input: [], bawaanOutput: "", bawaanInput: "" };

/** Tebak perangkat yang pas untuk tiap mode bila belum pernah diatur. */
function tebakProfil() {
  const cari = (daftar, pola, kecuali) => daftar.find((n) => pola.test(n) && !(kecuali && kecuali.test(n))) || "";
  const laptopOut = cari(AUDIO.output, /C-Media|Realtek|Speakers? \(|Speaker/i, /YA USB|USB Audio|AI Noise|Bluetooth|Headphones|Headset/i);
  const laptopIn = cari(AUDIO.input, /C-Media|Realtek|Microphone Array|Mikrofon|Microphone/i, /YA USB|USB Audio|AI Noise|Headset|Hands-Free/i);
  const rumahIn = cari(AUDIO.input, /YA USB|USB Audio/i);
  // Speaker mixer = perangkat Bluetooth/lain yang bukan speaker laptop dan bukan converter
  const rumahOut = (AUDIO.bawaanOutput && !/YA USB|USB Audio|AI Noise/i.test(AUDIO.bawaanOutput) && AUDIO.bawaanOutput !== laptopOut && AUDIO.bawaanOutput)
    || cari(AUDIO.output, /.*/, /YA USB|USB Audio|AI Noise|C-Media|Realtek/i);
  const p = P.profil;
  if (!p.rumah.input) p.rumah.input = rumahIn || laptopIn;
  if (!p.rumah.output) p.rumah.output = rumahOut;
  if (!p.laptop.input) p.laptop.input = laptopIn;
  if (!p.laptop.output) p.laptop.output = laptopOut;
  if (!p.rumah.putar) p.rumah.putar = (p.rumah.input && p.rumah.input === laptopIn) ? p.rumah.output : (laptopOut || p.rumah.output);
  if (!p.laptop.putar) p.laptop.putar = p.laptop.output;
}

async function muatAudio() {
  try { AUDIO = await apiJson("audio"); } catch {}
  tebakProfil();
}

// ================= Dropdown kaca (pengganti <select> bawaan) =================
function tutupDropdown() { $$(".dd.buka").forEach((d) => { d.classList.remove("buka"); const m = d.querySelector(".dd-menu"); if (m) m.hidden = true; }); }
document.addEventListener("click", tutupDropdown);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") tutupDropdown(); });
/** Pasang dropdown kaca di elemen .dd. opsi: [{ nilai, label, ket, ikon }]. */
function dropdown(el, { opsi, nilai, kepala, onPilih }) {
  el.innerHTML = '<button type="button" class="dd-btn"><span></span><i class="bi bi-chevron-down"></i></button><div class="dd-menu" hidden></div>';
  const btn = el.querySelector(".dd-btn"), menu = el.querySelector(".dd-menu");
  const isi = () => {
    const p = opsi.find((o) => o.nilai === nilai); btn.querySelector("span").textContent = p ? p.label : "–"; btn.title = p ? p.label : "";
    menu.innerHTML = (kepala ? '<div class="dd-kep">' + esc(kepala) + "</div>" : "") + opsi.map((o, i) =>
      '<div class="dd-op' + (o.nilai === nilai ? " on" : "") + '" data-i="' + i + '">' + (o.ikon ? '<i class="bi ' + o.ikon + '"></i>' : "") +
      "<span>" + esc(o.label) + (o.ket ? "<small>" + esc(o.ket) + "</small>" : "") + "</span>" + (o.nilai === nilai ? '<i class="bi bi-check2"></i>' : "") + "</div>").join("");
  };
  isi();
  btn.onclick = (e) => { e.stopPropagation(); const buka = menu.hidden; tutupDropdown(); if (buka) { menu.hidden = false; el.classList.add("buka"); } };
  menu.onclick = (e) => { e.stopPropagation(); const op = e.target.closest(".dd-op"); if (!op) return; const o = opsi[+op.dataset.i]; tutupDropdown(); if (o.nilai === nilai) return; nilai = o.nilai; isi(); onPilih(o.nilai); };
}
/** Keterangan + ikon perangkat audio untuk dropdown. */
function infoPerangkat(n, arah, ada) {
  const masuk = arah === "input", bawaan = n === (masuk ? AUDIO.bawaanInput : AUDIO.bawaanOutput);
  let ket = t("ketLain"), ikon = masuk ? "bi-mic" : "bi-speaker";
  if (/C-Media|Realtek/i.test(n)) ket = t("ketJack");
  else if (/YA USB|USB/i.test(n)) { ket = t("ketUsb"); ikon = "bi-usb-symbol"; }
  else if (/Headset|Hands-Free/i.test(n)) { ket = t("ketBtTelp"); ikon = "bi-headset"; }
  else if (/AI Noise/i.test(n)) { ket = t("ketAsus"); ikon = "bi-cpu"; }
  else if (/Headphones|Bluetooth/i.test(n)) ikon = "bi-headphones";
  if (!ada) { ket = t("ketTidakAda"); ikon = "bi-x-circle"; }
  else if (bawaan) ket += " · " + t("ketBawaan");
  return { nilai: n, label: n.replace(/\(R\)/g, ""), ket, ikon };
}
function isiPengaturanAudio() {
  const mode = P.modeAudio;
  $$("#pilihModeAudio button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  for (const arah of ["input", "output", "putar"]) {
    const daftar = AUDIO[arah === "putar" ? "output" : arah], kini = P.profil[mode][arah];
    const opsi = daftar.map((n) => infoPerangkat(n, arah, true));
    if (kini && !daftar.includes(kini)) opsi.unshift(infoPerangkat(kini, arah, false));
    dropdown($('[data-pilih-arah="' + arah + '"]'), { opsi, nilai: kini, kepala: t(arah === "input" ? "pilihMic" : "pilihSpeaker"),
      onPilih: (v) => { P.profil[mode][arah] = v; simpanPengaturan(); aktifkanMode(mode, true); } });
  }
  dropdown($("#ddBahasa"), { opsi: [{ nilai: "id", label: "Indonesia", ikon: "bi-translate" }, { nilai: "en", label: "English", ikon: "bi-translate" }], nilai: P.bahasa, kepala: t("pilihBahasa"),
    onPilih: (v) => { P.bahasa = v; aturBahasa(v); terapkanTema(); segarkanTeks(); simpanPengaturan(); } });
  apiJson("info").then((j) => ($("#folderRekaman").textContent = j.folder)).catch(() => {});
}
$$("#pilihModeAudio button").forEach((b) => (b.onclick = () => { if (!M.rek && P.modeAudio !== b.dataset.mode) aktifkanMode(b.dataset.mode); }));

/**
 * Aktifkan mode audio: atur speaker & mic bawaan Windows (YouTube ikut pindah),
 * pilih perangkat rekam dan speaker pemutar, lalu atur volume input.
 */
async function aktifkanMode(mode, diam = false) {
  P.modeAudio = mode; simpanPengaturan();
  $$("#modeAudio button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  if (!AUDIO.input.length) await muatAudio();
  const prof = P.profil[mode];
  const adaIn = AUDIO.input.includes(prof.input), adaOut = AUDIO.output.includes(prof.output);
  if (adaOut) await api("audio?" + q({ arah: "output", nama: prof.output }), { method: "POST" }).catch(() => {});
  if (adaIn) await api("audio?" + q({ arah: "input", nama: prof.input }), { method: "POST" }).catch(() => {});
  if (adaIn) await api("volume?" + q({ nama: prof.input, nilai: mode === "rumah" ? 100 : 80 }), { method: "POST" }).catch(() => {});
  await isiPerangkatBrowser();
  isiPengaturanAudio(); perbaruiRingkas(); perbaruiSiap();
  if (!diam) {
    if (mode === "rumah" && !adaIn) toast(t("converterTidakAda"), true);
    else toast(t("modeDiaktifkan") + ": " + t(mode === "rumah" ? "modeRumah" : "modeLaptop"));
  }
}
$$("#modeAudio button").forEach((b) => (b.onclick = () => aktifkanMode(b.dataset.mode)));

function perbaruiRingkas() {
  const prof = P.profil[P.modeAudio];
  $("#ringkasPerangkat").innerHTML = '<i class="bi ' + (P.modeAudio === "rumah" ? "bi-usb-symbol" : "bi-mic") + '" style="color:var(--p)"></i> <b>' + esc(prof.input || "-") + "</b><br>" +
    '<i class="bi bi-youtube" style="color:var(--p)"></i> YouTube <b>' + esc(prof.output || "-") + "</b><br>" +
    '<i class="bi bi-speaker" style="color:var(--p)"></i> ' + esc(t("putarRekaman")) + " <b>" + esc(prof.putar || prof.output || "-") + '</b> · <a id="lnkUbah">' + esc(t("ubah")) + "</a>";
  $("#lnkUbah").onclick = bukaPengaturan;
}

// ================= Perangkat browser & monitor level =================
const M = { ctx: null, stream: null, node: null, sumber: null, rek: false, potongan: [], puncak: 0, tampil: 0, riwayat: [], mulai: 0, izin: false, idInput: "", idOutput: "" };
const KODE_WORKLET = `
class PerekamOrulabs extends AudioWorkletProcessor {
  constructor() { super(); this.rek = false; this.buf = new Float32Array(2048); this.i = 0; this.p = 0;
    this.port.onmessage = (e) => { this.rek = e.data; }; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let k = 0; k < ch.length; k++) {
      const v = ch[k], a = v < 0 ? -v : v; if (a > this.p) this.p = a;
      this.buf[this.i++] = v;
      if (this.i === this.buf.length) { this.port.postMessage({ p: this.p, d: this.rek ? this.buf.slice() : null }); this.i = 0; this.p = 0; }
    }
    return true;
  }
}
registerProcessor("perekam-orulabs", PerekamOrulabs);`;

/** Pilih mic dan speaker di browser sesuai mode aktif, lalu mulai pantau level. */
async function isiPerangkatBrowser() {
  try {
    if (!M.izin) { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((x) => x.stop()); M.izin = true; }
  } catch { toast(t("micDitolak"), true); return; }
  const semua = await navigator.mediaDevices.enumerateDevices(), prof = P.profil[P.modeAudio];
  const masuk = semua.filter((d) => d.kind === "audioinput" && d.deviceId !== "communications");
  const keluar = semua.filter((d) => d.kind === "audiooutput" && d.deviceId !== "communications");
  const dIn = masuk.find((d) => d.deviceId !== "default" && cocok(d.label, prof.input)) || masuk.find((d) => d.deviceId === "default") || masuk[0];
  const tujuanPutar = prof.putar || prof.output;
  const dOut = keluar.find((d) => d.deviceId !== "default" && cocok(d.label, tujuanPutar)) || keluar.find((d) => d.deviceId === "default") || keluar[0];
  M.labelInput = dIn ? bersihNama(dIn.label) : ""; M.labelOutput = dOut ? bersihNama(dOut.label) : "";
  M.idOutput = dOut ? dOut.deviceId : "";
  if (dIn && dIn.deviceId !== M.idInput) { M.idInput = dIn.deviceId; await mulaiMonitor(); }
  bacaVolume();
}
navigator.mediaDevices.addEventListener("devicechange", tundaan(async () => { if (M.rek) return; await muatAudio(); await isiPerangkatBrowser(); perbaruiSiap(); }, 900));

async function mulaiMonitor() {
  if (M.stream) M.stream.getTracks().forEach((x) => x.stop());
  try {
    M.stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: M.idInput }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
  } catch (e) { toast(t("perangkatGagal") + ": " + e.message, true); return; }
  if (!M.ctx) {
    M.ctx = new AudioContext({ latencyHint: "interactive" });
    await M.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([KODE_WORKLET], { type: "text/javascript" })));
  }
  if (M.sumber) M.sumber.disconnect();
  M.sumber = M.ctx.createMediaStreamSource(M.stream);
  if (!M.analis) { M.analis = M.ctx.createAnalyser(); M.analis.fftSize = 2048; M.analis.smoothingTimeConstant = 0.3; }
  M.sumber.connect(M.analis);
  if (!M.node) {
    M.node = new AudioWorkletNode(M.ctx, "perekam-orulabs");
    M.node.port.onmessage = (e) => {
      const { p, d } = e.data;
      if (p > M.puncak) M.puncak = p;
      M.riwayat.push({ t: performance.now(), p });
      if (d && M.rek) M.potongan.push(d);
    };
    const sunyi = M.ctx.createGain(); sunyi.gain.value = 0; // worklet harus tersambung agar terus berjalan
    M.node.connect(sunyi); sunyi.connect(M.ctx.destination);
  }
  M.sumber.connect(M.node);
  perbaruiSiap();
}
document.addEventListener("pointerdown", () => { if (M.ctx && M.ctx.state === "suspended") M.ctx.resume(); }, true);

// Meter tegak: INPUT (puncak), VOKAL≈ dan MUSIK≈ (perkiraan dari pita frekuensi, karena vokal dan musik tercampur di mixer)
// Zona standar rekam vokal (puncak): ideal -18..-6 dB, agak keras -6..-3 dB, bahaya di atas -3 dB, pelan di bawah -18 dB
const zonaDb = (d) => (d > -3 ? "bahaya" : d > -6 ? "keras" : d >= -18 ? "ideal" : "pelan");
const BAR = [["#barIn", "#angIn"], ["#barVok", "#angVok"], ["#barMus", "#angMus"]].map(([id, ang]) => {
  const el = $(id);
  return { el, isi: el.querySelector(".isi"), tahan: el.querySelector(".tahan"), ang: $(ang), tampil: -90, puncak: -90, waktuPuncak: 0, angTerakhir: 0 };
});
// warna gradien mengikuti posisi dB di kapsul penuh (bukan ikut tinggi isi)
const ukurKapsul = () => BAR.forEach((b) => (b.isi.style.backgroundSize = "100% " + (b.el.clientHeight - 4) + "px"));
new ResizeObserver(ukurKapsul).observe($("#barIn")); ukurKapsul();
let bufFrek = null, bufWaktu = null, clipSampai = 0;
function isiBar(b, dbv, kini) {
  b.tampil = Math.max(dbv, b.tampil - 1.2);
  if (b.tampil >= b.puncak || kini - b.waktuPuncak > 1500) { b.puncak = b.tampil; b.waktuPuncak = kini; }
  const pos = (d) => Math.max(0, Math.min(1, (d + 60) / 60)) * 100;
  b.isi.style.height = "calc(" + pos(b.tampil) + "% - 4px)";
  b.tahan.style.bottom = "calc(" + pos(b.puncak) + "% - 2px)";
  // angka puncak diperbarui 5x per detik supaya mudah dibaca
  if (kini - b.angTerakhir > 200) {
    b.angTerakhir = kini;
    const aktif = b.puncak > -59;
    b.ang.textContent = aktif ? Math.min(0, Math.round(b.puncak)) : "–";
    b.ang.className = "ang" + (aktif ? " " + zonaDb(b.puncak) : "");
  }
}
(function animasiMeter() {
  const kini = performance.now();
  M.tampil = Math.max(M.puncak, M.tampil * 0.86);
  if (M.puncak >= 0.99) clipSampai = kini + 2000;
  M.puncak = 0;
  const dbIn = 20 * Math.log10(Math.max(M.tampil, 1e-6));
  let dbVok = -90, dbMus = -90;
  if (M.analis) {
    const an = M.analis, rate = M.ctx.sampleRate;
    if (!bufFrek) { bufFrek = new Float32Array(an.frequencyBinCount); bufWaktu = new Float32Array(an.fftSize); }
    an.getFloatFrequencyData(bufFrek); an.getFloatTimeDomainData(bufWaktu);
    let rms = 0; for (const v of bufWaktu) rms += v * v; rms = Math.sqrt(rms / bufWaktu.length);
    let pv = 0, pm = 0, pt = 0; const lebar = rate / an.fftSize;
    for (let k = 1; k < bufFrek.length; k++) {
      const f = k * lebar, p = Math.pow(10, bufFrek[k] / 10); if (f < 40 || f > 14000) continue;
      pt += p; if (f >= 250 && f <= 3500) pv += p; else pm += p;
    }
    if (pt > 0 && rms > 0) { const dr = 20 * Math.log10(rms) + 3; dbVok = dr + 10 * Math.log10(Math.max(pv / pt, 1e-6)); dbMus = dr + 10 * Math.log10(Math.max(pm / pt, 1e-6)); }
  }
  isiBar(BAR[0], dbIn, kini); isiBar(BAR[1], dbVok, kini); isiBar(BAR[2], dbMus, kini);
  BAR[0].el.classList.toggle("klip", kini < clipSampai);
  if (M.rek) {
    const lama = (kini - M.mulai) / 1000; $("#timer").textContent = waktu(lama);
    // cincin tombol: sisa lagu YouTube bila merekam bersama lagu, selain itu berputar tiap menit
    let f = (lama % 60) / 60;
    try { if (M.bersamaYt && YT.pemutar && YT.pemutar.getDuration() > 0) f = YT.pemutar.getCurrentTime() / YT.pemutar.getDuration(); } catch {}
    $("#cincinRekam").style.strokeDashoffset = 289 * (1 - Math.max(0, Math.min(1, f)));
  } else $("#cincinRekam").style.strokeDashoffset = 289;
  requestAnimationFrame(animasiMeter);
})();

async function bacaVolume() {
  try {
    const j = await apiJson("volume?" + q({ nama: M.labelInput }));
    const ada = j.nilai >= 0; $("#volInput").disabled = !ada;
    if (ada) { $("#volInput").value = j.nilai; isiSlider($("#volInput")); }
    $("#volNilai").textContent = ada ? j.nilai + "%" : "–";
  } catch {}
}
const aturVolume = tundaan((v) => api("volume?" + q({ nama: M.labelInput, nilai: v }), { method: "POST" }).catch(() => {}), 150);
$("#volInput").addEventListener("input", (e) => { $("#volNilai").textContent = e.target.value + "%"; aturVolume(e.target.value); });

function setCek(id, ok, teks) {
  const el = $(id); el.classList.toggle("no", !ok);
  el.querySelector("i").className = "bi " + (ok ? "bi-check-circle-fill" : "bi-exclamation-circle-fill");
  el.querySelector("span").textContent = teks;
}
function perbaruiSiap() {
  const prof = P.profil[P.modeAudio];
  const inputOk = !!(M.stream && M.stream.active) && (!prof.input || cocok(M.labelInput, prof.input));
  const outputOk = !!prof.output && AUDIO.output.includes(prof.output) && (!prof.putar || AUDIO.output.includes(prof.putar));
  const kini = performance.now(); M.riwayat = M.riwayat.filter((r) => kini - r.t < 3000);
  const maks = M.riwayat.reduce((a, r) => Math.max(a, r.p), 0), dbMaks = 20 * Math.log10(Math.max(maks, 1e-6));
  setCek("#cekInput", inputOk, t("cekMic")); $("#cekInput").title = M.labelInput || "";
  setCek("#cekOutput", outputOk, t("cekSpeaker")); $("#cekOutput").title = prof.output || "";
  setCek("#cekLevel", dbMaks > -30 && dbMaks < -3, t("cekLvl")); $("#cekLevel").title = dbMaks >= -3 ? t("terlaluKeras") : dbMaks <= -30 ? t("levelPelan") : t("levelPas");
  setCek("#cekYt", YT.status === 1, t("cekYtSingkat")); $("#cekYt").title = YT.status === 1 ? t("ytJalan") : YT.status === 5 ? t("laguSiapPendek") : t("ytDiam");
  $("#cekYt i").className = "bi " + (YT.status === 1 ? "bi-play-circle-fill" : "bi-pause-circle-fill");
  $("#siapTeks").textContent = inputOk ? (M.rek ? t("merekamChip") : t("siapRekam")) : (P.modeAudio === "rumah" ? t("cekConverter") : t("cekMic"));
  $("#siapDot").style.background = inputOk ? (M.rek ? "#ff4d5e" : "") : "#fbbf24";
  // Titik kuning di tombol Pengaturan bila perangkat belum siap (misalnya converter belum dicolok)
  $("#btnPengaturan").classList.toggle("peringatan", !inputOk || !outputOk);
  $("#btnPengaturan").title = $("#siapTeks").textContent;
  $("#siap").title = (prof.input || "-") + " → " + (prof.output || "-");
}
setInterval(perbaruiSiap, 1000);

// ================= Merekam =================
async function mulaiRekam() {
  if (!M.node || !M.stream || !M.stream.active) { toast(t("belumSiap"), true); return; }
  if (Pm.main) hentikanPutar();
  await M.ctx.resume();
  // Rekam 2 jalur: musik direkam langsung dari laptop (speaker bawaan Windows) selama merekam bersama lagu
  M.jalurMusik = false;
  if (P.duaJalur && P.sinkronYt && YT.pemutar && YT.kini) {
    try { const j = await apiJson("musik/mulai", { method: "POST" }); M.jalurMusik = !!j.ok; if (!j.ok) toast(t("jalurGagal"), true); } catch { toast(t("jalurGagal"), true); }
  }
  M.potongan = []; M.rek = true; M.mulai = performance.now();
  api("ping?rek=1").catch(() => {}); // beri tahu server: sedang merekam (update ditunda)
  // Rekam langsung dari mic dengan jam mic sendiri. Lewat AudioContext, jamnya ikut speaker (Bluetooth) dan
  // Chrome membuang potongan suara saat Bluetooth tersendat, sehingga rekaman terdengar makin cepat.
  M.langsung = null;
  if (window.MediaStreamTrackProcessor) {
    try {
      const tr = M.stream.getAudioTracks()[0].clone(), rd = new MediaStreamTrackProcessor({ track: tr }).readable.getReader();
      const L = { tr, rd, potongan: [], rate: 0, aktif: true };
      L.selesai = (async () => {
        while (L.aktif) {
          const { value, done } = await rd.read(); if (done) break;
          L.rate = value.sampleRate; const f = new Float32Array(value.numberOfFrames);
          value.copyTo(f, { planeIndex: 0, format: "f32-planar" }); value.close(); L.potongan.push(f);
        }
      })().catch(() => {});
      M.langsung = L;
    } catch { M.langsung = null; }
  }
  if (!M.langsung) M.node.port.postMessage(true);
  // Rekam bersama YouTube: lagu yang sedang dibuka ikut jalan, judulnya dipakai untuk nama rekaman
  M.judulLagu = YT.kini ? YT.kini.judul : "";
  M.bersamaYt = !!(P.sinkronYt && YT.pemutar && YT.kini);
  if (M.bersamaYt && YT.status !== 1 && YT.status !== 3) { try { YT.pemutar.playVideo(); } catch {} }
  $("#btnRekam").classList.add("on"); $("#btnRekam i").className = "bi bi-stop-fill";
  $("#recPill").classList.remove("diam"); $("#recPill span").textContent = t("rec");
  $("#timerKet").textContent = t("merekamKet");
  aturTombol(); perbaruiSiap();
}
/** Nama rekaman: judul lagu yang dinyanyikan (tanpa embel-embel "karaoke") + jam, atau "Rekaman <tanggal jam>". */
function namaRekamanBaru() {
  const j = (M.judulLagu || "").replace(/[\[(（【][^\])）】]*(karaoke|lirik|lyrics?|instrumental|official|version|versi|hq|audio|key|nada)[^\])）】]*[\])）】]/gi, "")
    .replace(/\b(karaoke|lirik|lyrics?|instrumental)\b/gi, "").replace(/[|•·]+.*$/, "").replace(/\s*[-–—]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  const d = new Date(), jam = String(d.getHours()).padStart(2, "0") + "." + String(d.getMinutes()).padStart(2, "0");
  return j ? (j.length > 70 ? j.slice(0, 70).trim() : j) + " " + jam : "Rekaman " + cap(d);
}
async function selesaiRekam() {
  if (!M.rek) return;
  M.node.port.postMessage(false); await tunggu(120); M.rek = false;
  const L = M.langsung; M.langsung = null;
  if (L) { L.aktif = false; try { await L.rd.cancel(); } catch {} L.tr.stop(); await L.selesai; }
  if (M.bersamaYt && YT.pemutar && (YT.status === 1 || YT.status === 3)) { try { YT.pemutar.pauseVideo(); } catch {} }
  $("#btnRekam").classList.remove("on"); $("#btnRekam i").className = "bi bi-mic-fill";
  $("#recPill").classList.add("diam"); $("#recPill span").textContent = t("siap");
  $("#timerKet").textContent = t("tekanRekam");
  aturTombol(); perbaruiSiap();
  const sumber = L && L.rate ? L.potongan : M.potongan;
  const total = sumber.reduce((a, c) => a + c.length, 0);
  let data = new Float32Array(total), o = 0;
  for (const c of sumber) { data.set(c, o); o += c.length; }
  M.potongan = [];
  const rate = L && L.rate ? L.rate : M.ctx.sampleRate;
  // Cek: panjang rekaman harus sama dengan lama merekam (selisih besar = ada suara yang hilang)
  const lama = (performance.now() - M.mulai) / 1000 - 0.12, selisih = total / rate - lama;
  console.info("rekam:", L && L.rate ? "langsung" : "worklet", rate, "Hz,", (total / rate).toFixed(2), "dtk dari", lama.toFixed(2), "dtk");
  if (total >= rate * 0.5 && Math.abs(selisih) > Math.max(0.5, lama * 0.01)) toast(t("rekamTerputus"), true);
  if (total < rate * 0.5) { if (M.jalurMusik) api("musik/batal", { method: "POST" }).catch(() => {}); toast(t("terlaluPendek"), true); return; }
  if (P.keraskanOto) data = dsp.keraskanRekaman(data, rate);
  try {
    const j = await apiJson("rekaman/simpan?" + q({ nama: namaRekamanBaru() }), { method: "POST", body: dsp.keWav(data, rate) });
    if (M.jalurMusik) {
      M.jalurMusik = false;
      const m = await apiJson("musik/selesai?" + q({ nama: j.nama }), { method: "POST" }).catch(() => ({ ok: false }));
      toast(t(m.ok ? "jalurSiap" : "jalurHilang"), !m.ok);
    }
    toast(t("tersimpan") + ": " + j.nama + (P.keraskanOto ? " (" + t("dikeraskan") + ")" : ""));
    await muatDaftar(); tampilkanRekaman(j.nama, data, rate);
    $("#btnRapikan").classList.add("baru"); toast(t("rapikanSiap"));
  } catch (e) { if (M.jalurMusik) api("musik/batal", { method: "POST" }).catch(() => {}); toast(t("gagalSimpan") + ": " + e.message, true); }
}
$("#btnRekam").onclick = () => (M.rek ? selesaiRekam() : mulaiRekam());
$("#btnStop").onclick = () => { if (M.rek) selesaiRekam(); else if (Pm.main) hentikanPutar(); };

// ================= Daftar rekaman =================
const R = { daftar: [], nama: null, asli: null, rate: 48000, studio: null, analisa: null, awal: 0, akhir: 1, lihat: "asli", versi: 0 };

async function muatDaftar() {
  try { R.daftar = await apiJson("rekaman"); } catch { R.daftar = []; }
  $("#jumlah").textContent = R.daftar.length || "";
  const hariIni = new Date().toDateString();
  $("#daftar").innerHTML = R.daftar.length ? R.daftar.map((r) => {
    const w = new Date(r.waktu), studio = /\(Studio\)/i.test(r.nama);
    const kapan = w.toDateString() === hariIni ? w.toTimeString().slice(0, 5) : w.toLocaleDateString(P.bahasa === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short" });
    return '<div class="item' + (r.nama === R.nama ? " on" : "") + '" data-n="' + esc(r.nama) + '"><button class="ic" data-putar title="' + esc(t("putar")) + '"><i class="bi bi-play-fill"></i></button>' +
      "<div><b>" + esc(r.nama) + "</b><span>" + kapan + " · " + t(studio ? "studio" : "asli") + '</span></div><div class="r">' + waktu(r.durasi) + "</div></div>";
  }).join("") : '<div class="info">' + esc(t("belumRekaman")) + "</div>";
  $$("#daftar .item").forEach((el) => (el.onclick =(e) => (e.target.closest("[data-putar]") ? putarDariDaftar(el.dataset.n) : bukaRekaman(el.dataset.n))));
  aturTombol();
}

/** Tombol ▶/⏸ di daftar: putar rekaman itu, atau jeda/lanjutkan bila sedang dipilih. */
async function putarDariDaftar(nama) {
  if (M.rek) return;
  if (R.nama === nama && R.asli) { if (Pm.main) hentikanPutar(); else putar(); return; }
  await bukaRekaman(nama);
  if (R.nama === nama && R.asli) putar();
}

async function bukaRekaman(nama) {
  if (M.rek) return;
  if (Pm.main) hentikanPutar();
  try {
    const buf = await (await api("rekaman/file?" + q({ nama }))).arrayBuffer();
    let w = dsp.bacaWav(buf);
    if (!w) { const ac = new OfflineAudioContext(1, 1, 48000); const ab = await ac.decodeAudioData(buf); w = { data: dsp.keMono(ab), rate: ab.sampleRate }; }
    tampilkanRekaman(nama, w.data, w.rate);
  } catch (e) { toast(e.message, true); }
}

function tampilkanRekaman(nama, data, rate) {
  Object.assign(R, { nama, asli: data, rate, studio: null, awal: 0, akhir: 1, versi: R.versi + 1, pita: null, gaya: 2, musik: null, geser: 0, asliMix: null, magicAktif: false, vokalMagic: null });
  $("#mvStatus").hidden = true; $("#kartuNada").hidden = true; tutupMagic();
  tampilMix();
  $("#gayaRapikan").hidden = true;
  $("#namaRekaman").removeAttribute("data-t"); $("#namaRekaman").textContent = nama;
  $$("#daftar .item").forEach((el) => el.classList.toggle("on", el.dataset.n === nama));
  Pm.posisi = 0; setLihat("asli");
  R.analisa = dsp.analisa(data, rate); tampilkanAnalisa();
  R.levelInfo = dsp.ringkasLevel(data, rate); tampilRingkasLevel();
  prosesUlang(); aturTombol();
  muatJalurMusik(nama);
}

/** Muat jalur musik rekaman 2 jalur, samakan sample rate, lalu cari keterlambatan vokal (sinkron). */
async function muatJalurMusik(nama) {
  const info = R.daftar.find((r) => r.nama === nama);
  if (!info || !info.musik) return;
  try {
    const buf = await (await api("rekaman/musik?" + q({ nama }))).arrayBuffer();
    const w = dsp.bacaWav(buf); if (!w || R.nama !== nama) return;
    R.musik = dsp.ubahRate(w.data, w.rate, R.rate);
    const auto = dsp.cariGeser(R.asli, R.musik, R.rate);
    // tanpa petunjuk dari rekaman: speaker kabel ±30 ms, Bluetooth ±200 ms
    R.geser = auto != null ? auto : (/C-Media|Realtek|USB/i.test(P.profil[P.modeAudio].output || "") ? 30 : 200);
    const simpan = (P.mixRekaman || {})[nama];
    if (simpan) { P.mixVokal = simpan.v; P.mixMusik = simpan.m; if (simpan.g != null) R.geser = simpan.g; R.mixAuto = false; }
    else { P.mixVokal = 100; R.mixAuto = true; }
    R.asliMix = null; tampilMix(); prosesUlang();
  } catch {}
}

/** Ringkasan level di pojok gelombang: berapa persen bagian bernyanyi di zona ideal, dan berapa kali hampir pecah. */
function tampilRingkasLevel() {
  const el = $("#ringkasLevel"), L = R.levelInfo;
  if (!L) { el.hidden = true; return; }
  let kelas = "ok", teks;
  // 1-2 detik menyentuh batas masih wajar (pembatas aplikasi menanganinya); mulai 3 detik baru diperingatkan
  if (L.bahaya >= 3) { kelas = "bahaya"; teks = t("lvBahaya").replace("{n}", L.bahaya); }
  else if (L.pelan > 40) { kelas = "pelan"; teks = t("lvPelan"); }
  else if (L.ideal >= 70) teks = t("lvIdeal").replace("{p}", L.ideal);
  else { kelas = "pelan"; teks = t("lvCukup").replace("{p}", L.ideal); }
  el.className = "ringkas-level " + kelas;
  el.innerHTML = '<i class="bi ' + (kelas === "ok" ? "bi-check-circle-fill" : "bi-exclamation-circle-fill") + '"></i>' + esc(teks);
  el.hidden = R.lihat === "studio";
}

// ================= Baris Mix =================
function tampilMix() {
  const ada = !!R.asli; $("#barisMix").hidden = !ada; if (!ada) return;
  const dua = !!R.musik; $("#mixDua").hidden = !dua; $("#mixSatu").hidden = dua;
  const set = (id, v, teks) => { const el = $(id); el.value = v; isiSlider(el); $(id + "Nilai").textContent = teks; };
  set("#mixVokal", P.mixVokal, P.mixVokal + "%"); set("#mixMusik", P.mixMusik, P.mixMusik + "%");
  $("#sinkronNilai").textContent = Math.round(R.geser || 0) + " ms";
  const f = $("#fokusVokal"); f.value = P.fokusVokal; isiSlider(f); $("#fokusNilai").textContent = (P.fokusVokal > 0 ? "+" : "") + P.fokusVokal;
}
/** Ingat setelan mix untuk rekaman yang sedang dibuka (paling banyak 200 rekaman). */
function simpanMix() {
  if (!R.nama || !R.musik) return;
  P.mixRekaman = P.mixRekaman || {}; delete P.mixRekaman[R.nama];
  P.mixRekaman[R.nama] = { v: P.mixVokal, m: P.mixMusik, g: R.geser };
  const kunci = Object.keys(P.mixRekaman); if (kunci.length > 200) delete P.mixRekaman[kunci[0]];
}
const mixBerubah = tundaan(() => { R.asliMix = null; simpanMix(); simpanPengaturan(); prosesUlang(); if (R.lihat !== "studio") setLihat("studio"); }, 250);
$("#mixVokal").addEventListener("input", (e) => { P.mixVokal = +e.target.value; tampilMix(); mixBerubah(); });
$("#mixMusik").addEventListener("input", (e) => { P.mixMusik = +e.target.value; tampilMix(); mixBerubah(); });
$("#fokusVokal").addEventListener("input", (e) => { P.fokusVokal = +e.target.value; tampilMix(); mixBerubah(); });
$("#sinkronKurang").onclick = () => { R.geser = Math.max(-300, (R.geser || 0) - 10); tampilMix(); mixBerubah(); };
$("#sinkronTambah").onclick = () => { R.geser = Math.min(800, (R.geser || 0) + 10); tampilMix(); mixBerubah(); };

$("#btnGanti").onclick = async () => {
  if (!R.nama) return;
  const baru = await dialog({ judul: t("gantiNama"), input: R.nama, ok: t("ganti") });
  if (!baru || baru.trim() === R.nama) return;
  try { const j = await apiJson("rekaman/ganti-nama?" + q({ lama: R.nama, baru: baru.trim() }), { method: "POST" }); if (P.vokalSaja && P.vokalSaja[R.nama]) { delete P.vokalSaja[R.nama]; P.vokalSaja[j.nama] = true; simpanPengaturan(); }
    R.nama = j.nama; $("#namaRekaman").textContent = j.nama; await muatDaftar(); toast(t("namaDiganti")); }
  catch (e) { toast(e.message, true); }
};
$("#btnHapus").onclick = async () => {
  if (!R.nama) return;
  if (!(await dialog({ judul: t("hapusJudul"), teks: "\"" + R.nama + "\" " + t("hapusKet"), ok: t("hapus"), bahaya: true }))) return;
  try {
    if (Pm.main) hentikanPutar();
    await api("rekaman/hapus?" + q({ nama: R.nama }), { method: "POST" });
    Object.assign(R, { nama: null, asli: null, studio: null, analisa: null, musik: null }); tampilMix(); $("#gayaRapikan").hidden = true;
    $("#namaRekaman").setAttribute("data-t", "belumDipilih"); $("#namaRekaman").textContent = t("belumDipilih");
    gambarGelombang(); tampilkanAnalisa(); aturTombol(); await muatDaftar(); toast(t("keRecycle"));
  } catch (e) { toast(e.message, true); }
};
const bukaFolder = () => api("folder" + (R.nama ? "?" + q({ nama: R.nama }) : ""), { method: "POST" }).catch((e) => toast(e.message, true));
$("#btnFolder").onclick = bukaFolder;
$("#btnBukaFolder").onclick = bukaFolder;

// ================= Gelombang, potong, posisi =================
const kanvas = $("#wave"), wadah = $("#gelombang");
const AMBANG = { bahaya: Math.pow(10, -3 / 20), atas: Math.pow(10, -6 / 20), bawah: Math.pow(10, -18 / 20) };
const dataTampil = () => (R.lihat === "studio" ? R.studio : R.asli);
let cachePuncak = null;

function gambarGelombang() {
  const r = window.devicePixelRatio || 1, w = kanvas.clientWidth, h = kanvas.clientHeight;
  kanvas.width = w * r; kanvas.height = h * r;
  const g = kanvas.getContext("2d"); g.scale(r, r); g.clearRect(0, 0, w, h);
  const x = dataTampil(), studioView = R.lihat === "studio";
  $("#waveKosong").hidden = !!x;
  $("#waveKosong").textContent = R.asli && !x ? t("diproses") : t("gelombangKosong");
  ["#hL", "#hR", "#trimL", "#trimR"].forEach((s) => ($(s).hidden = !x || studioView));
  if (!x) { $("#penggaris").innerHTML = ""; return; }
  const css = getComputedStyle(html), grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, css.getPropertyValue("--p").trim()); grad.addColorStop(1, css.getPropertyValue("--p2").trim());
  const kolom = Math.max(1, Math.floor(w / 3)), posisi = (Pm.main ? Pm.posisiKini : Pm.posisi) / (x.length / R.rate);
  if (!cachePuncak || cachePuncak.data !== x || cachePuncak.kolom !== kolom) {
    const per = x.length / kolom, pk = new Float32Array(kolom);
    for (let c = 0; c < kolom; c++) { let mx = 0; const a = Math.floor(c * per), b = Math.min(x.length, Math.floor((c + 1) * per)); for (let i = a; i < b; i += 2) { const v = Math.abs(x[i]); if (v > mx) mx = v; } pk[c] = mx; }
    cachePuncak = { data: x, kolom, pk };
  }
  for (let c = 0; c < kolom; c++) {
    const mx = cachePuncak.pk[c], bh = Math.max(2, Math.min(1, mx * 1.15) * (h - 12));
    const fr = c / kolom, diPotong = !studioView && (fr < R.awal || fr > R.akhir);
    g.globalAlpha = diPotong ? 0.18 : fr < posisi ? 1 : 0.5;
    g.fillStyle = mx >= (studioView ? 0.99 : AMBANG.bahaya) ? "#ff4d5e" : grad; g.fillRect(c * 3, (h - bh) / 2, 2, bh);
  }
  if (!studioView) {
    // garis ambang: merah -3 dB (batas pecah), hijau -6 dB dan -18 dB (zona ideal)
    const tinggi = (amp) => Math.min(1, amp * 1.15) * (h - 12) / 2;
    [[AMBANG.bahaya, "rgba(255,77,94,.85)", "−3 dB"], [AMBANG.atas, "rgba(52,211,153,.8)", "−6 dB"], [AMBANG.bawah, "rgba(52,211,153,.55)", "−18 dB"]].forEach(([amp, warna, teks]) => {
      const dy = tinggi(amp);
      g.strokeStyle = warna; g.lineWidth = 1; g.setLineDash([5, 4]);
      for (const y of [h / 2 - dy, h / 2 + dy]) { g.beginPath(); g.moveTo(0, Math.round(y) + .5); g.lineTo(w, Math.round(y) + .5); g.stroke(); }
      g.setLineDash([]); g.fillStyle = warna; g.font = "600 10px Inter, sans-serif"; g.textAlign = "right"; g.fillText(teks, w - 6, h / 2 - dy - 3);
    });
  }
  $("#ringkasLevel").hidden = studioView || !R.levelInfo;
  g.globalAlpha = 1; g.fillStyle = "#fbbf24"; g.fillRect(Math.round(w * Math.min(1, posisi)), 0, 2, h);
  if (!studioView) {
    $("#hL").style.left = R.awal * 100 + "%"; $("#hR").style.left = R.akhir * 100 + "%";
    $("#trimL").style.width = R.awal * 100 + "%"; $("#trimR").style.width = (1 - R.akhir) * 100 + "%";
  }
  const dur = x.length / R.rate;
  $("#penggaris").innerHTML = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => "<span>" + waktu(dur * f) + "</span>").join("");
}
new ResizeObserver(() => gambarGelombang()).observe(wadah);

function seret(pegangan, ke) {
  pegangan.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); pegangan.setPointerCapture(e.pointerId);
    const gerak = (ev) => {
      const k = wadah.getBoundingClientRect(), f = Math.max(0, Math.min(1, (ev.clientX - k.left) / k.width));
      if (ke === "awal") R.awal = Math.min(f, R.akhir - 0.02); else R.akhir = Math.max(f, R.awal + 0.02);
      gambarGelombang();
    };
    const lepas = () => { pegangan.removeEventListener("pointermove", gerak); pegangan.removeEventListener("pointerup", lepas); prosesUlang(); };
    pegangan.addEventListener("pointermove", gerak); pegangan.addEventListener("pointerup", lepas);
  });
}
seret($("#hL"), "awal"); seret($("#hR"), "akhir");
// Geser posisi putar: klik atau tarik di gelombang. Saat ditarik, pemutaran berhenti sebentar lalu lanjut dari posisi baru.
const labelPosisi = document.createElement("div"); labelPosisi.className = "label-posisi"; labelPosisi.hidden = true; wadah.appendChild(labelPosisi);
function aturPosisiDari(e) {
  const x = dataTampil(), k = wadah.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - k.left) / k.width));
  Pm.posisi = f * x.length / R.rate;
  labelPosisi.textContent = waktu(Pm.posisi); labelPosisi.style.left = f * 100 + "%"; labelPosisi.hidden = false;
  gambarGelombang();
}
wadah.addEventListener("pointerdown", (e) => {
  if (!dataTampil() || e.button !== 0) return;
  const tadiMain = Pm.main; if (tadiMain) hentikanPutar();
  wadah.setPointerCapture(e.pointerId); wadah.classList.add("menyeret"); aturPosisiDari(e);
  const gerak = (ev) => aturPosisiDari(ev);
  const lepas = () => {
    wadah.removeEventListener("pointermove", gerak); wadah.removeEventListener("pointerup", lepas); wadah.removeEventListener("pointercancel", lepas);
    wadah.classList.remove("menyeret"); labelPosisi.hidden = true;
    if (tadiMain) putar();
  };
  wadah.addEventListener("pointermove", gerak); wadah.addEventListener("pointerup", lepas); wadah.addEventListener("pointercancel", lepas);
});
// Panah kiri/kanan: mundur/maju 5 detik (kecuali sedang mengetik)
document.addEventListener("keydown", (e) => {
  if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || !dataTampil() || e.target.closest("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  const x = dataTampil(), dur = x.length / R.rate, tadiMain = Pm.main, pos = Pm.posisiKini;
  if (tadiMain) hentikanPutar();
  Pm.posisi = Math.max(0, Math.min(dur - 0.1, pos + (e.key === "ArrowRight" ? 5 : -5)));
  if (tadiMain) putar(); else gambarGelombang();
});
function setLihat(v) {
  R.lihat = v; $$("#ab button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  if (Pm.main) hentikanPutar(); Pm.posisi = 0; gambarGelombang();
}
$$("#ab button").forEach((b) => (b.onclick = () => setLihat(b.dataset.v)));

// ================= Memutar rekaman (ke speaker mode aktif) =================
const Pm = { ctx: null, src: null, main: false, posisi: 0, mulaiCtx: 0, mulaiPos: 0, sink: null };
Object.defineProperty(Pm, "posisiKini", { get() { return Pm.main ? Pm.mulaiPos + (Pm.ctx.currentTime - Pm.mulaiCtx) : Pm.posisi; } });

/** Siapkan AudioContext pemutar dan arahkan ke speaker mode aktif. */
async function siapkanPemutar() {
  if (!Pm.ctx) {
    Pm.ctx = new AudioContext();
    Pm.vol = Pm.ctx.createGain(); Pm.vol.gain.value = volPutarNilai();
    // pembatas: volume di atas 100% tidak membuat suara pecah
    const bt = Pm.ctx.createDynamicsCompressor(); bt.threshold.value = -1; bt.knee.value = 0; bt.ratio.value = 20; bt.attack.value = 0.002; bt.release.value = 0.15;
    Pm.vol.connect(bt); bt.connect(Pm.ctx.destination);
  }
  const sink = M.idOutput && M.idOutput !== "default" ? M.idOutput : "";
  if (Pm.ctx.setSinkId && Pm.sink !== sink) { try { await Pm.ctx.setSinkId(sink); Pm.sink = sink; } catch {} }
  await Pm.ctx.resume();
}
/** Data yang diputar: tampilan Asli pada rekaman 2 jalur = vokal mentah + musik. */
function dataPutar() {
  if (R.lihat !== "studio" && R.musik && R.asli) {
    if (!R.asliMix) R.asliMix = dsp.campurMentah(R.asli, R.musik, R.rate, { volV: P.mixVokal / 100, volM: P.mixMusik / 100, geserMs: R.geser || 0 });
    return R.asliMix;
  }
  return dataTampil();
}
async function putar() {
  const x = dataPutar();
  if (!x) { if (R.asli && R.lihat === "studio") toast(t("studioBelum")); return; }
  if (M.rek) return;
  await siapkanPemutar();
  const b = Pm.ctx.createBuffer(1, x.length, R.rate); b.copyToChannel(x, 0);
  if (Pm.posisi >= x.length / R.rate - 0.05) Pm.posisi = 0;
  Pm.src = Pm.ctx.createBufferSource(); Pm.src.buffer = b; Pm.src.connect(Pm.vol);
  Pm.src.onended = () => { if (Pm.main) { Pm.main = false; Pm.posisi = 0; aturTombol(); gambarGelombang(); } };
  Pm.mulaiCtx = Pm.ctx.currentTime; Pm.mulaiPos = Pm.posisi; Pm.src.start(0, Pm.posisi); Pm.main = true;
  toast(t("memutarKe") + ": " + (M.labelOutput || "Windows"));
  aturTombol();
}
function hentikanPutar(simpanPosisi = true) {
  if (!Pm.main) return;
  const pos = Pm.posisiKini; Pm.main = false;
  try { Pm.src.onended = null; Pm.src.stop(); } catch {}
  Pm.posisi = simpanPosisi ? pos : 0; aturTombol(); gambarGelombang();
}
setInterval(() => { if (Pm.main) gambarGelombang(); }, 80);
$("#btnPutar").onclick = () => (Pm.main ? hentikanPutar() : putar());
$("#btnDengar").onclick = () => { if (!R.asli) { toast(t("pilihDulu"), true); return; } setLihat("studio"); putar(); };

// Volume putar rekaman (0-200%), tersimpan di pengaturan; klik ikon = bisu/bunyi lagi
function volPutarNilai() { return (P.volPutar ?? 100) / 100; }
function tampilVolPutar() {
  const v = P.volPutar ?? 100; $("#volPutar").value = v; isiSlider($("#volPutar")); $("#volPutarNilai").textContent = v + "%";
  $("#ikonVolPutar").className = "bi " + (v === 0 ? "bi-volume-mute" : v < 60 ? "bi-volume-down" : "bi-volume-up");
  if (Pm.vol) Pm.vol.gain.setTargetAtTime(v / 100, Pm.ctx.currentTime, 0.03);
}
$("#volPutar").addEventListener("input", (e) => { P.volPutar = Number(e.target.value); tampilVolPutar(); simpanPengaturan(); });
$("#ikonVolPutar").onclick = () => {
  if (P.volPutar > 0) { Pm.volSebelum = P.volPutar; P.volPutar = 0; } else P.volPutar = Pm.volSebelum || 100;
  tampilVolPutar(); simpanPengaturan();
};
tampilVolPutar();

// Panel Studio/Analisa bisa disembunyikan supaya YouTube lebih lebar
function aturSamping(tutup) {
  P.sampingTutup = !!tutup; $(".stage").classList.toggle("samping-tutup", P.sampingTutup);
  setTimeout(() => gambarGelombang(), 50);
}
$("#btnTutupSamping").onclick = () => { aturSamping(true); simpanPengaturan(); };
$("#btnBukaSamping").onclick = () => { aturSamping(false); simpanPengaturan(); };
$$("#relSamping [data-buka]").forEach((b) => (b.onclick = () => { aturSamping(false); simpanPengaturan(); const tab = $('.tabs [data-tab="' + b.dataset.buka + '"]'); if (tab) tab.click(); }));

// Pilihan kerja di bilah atas
function tampilModeKerja() { $$("#modeKerja button").forEach((b) => b.classList.toggle("on", b.dataset.m === P.modeKerja)); }
$$("#modeKerja button").forEach((b) => (b.onclick = () => {
  if (P.modeKerja === b.dataset.m) return;
  P.modeKerja = b.dataset.m; tampilModeKerja(); simpanPengaturan();
  toast(t(P.modeKerja === "youtube" ? "modeYtAktif" : "modeRekamAktif"));
  // pindah ke YouTube dengan lagu yang sedang disiapkan: langsung putar
  if (P.modeKerja === "youtube" && YT.pemutar && YT.status !== 1 && YT.status !== 3 && YT.kini && !M.rek) { try { YT.pemutar.playVideo(); } catch {} }
}));
tampilModeKerja();

// Pilihan hasil Rapikan: 1 Natural, 2 Video klip, 3 Hangat (potongan senyap dari Rapikan tetap dipakai)
function tampilGaya(g) {
  R.gaya = g; $("#gayaRapikan").hidden = false;
  $$("#gayaRapikan button").forEach((b) => b.classList.toggle("on", +b.dataset.g === g));
  $("#gayaKet").textContent = "· " + t("ket" + g);
}
$$("#gayaRapikan button").forEach((b) => (b.onclick = () => {
  if (!R.asli || !R.analisa) return;
  const g = +b.dataset.g; if (!R.pita) R.pita = dsp.profilPita(R.asli, R.rate);
  tampilGaya(g); terapkanSetelan(dsp.setelanOtomatis(R.analisa, R.pita, g)); setLihat("studio");
}));
// Simpan: hasil Studio jadi file baru; rekaman asli sudah otomatis tersimpan
$("#btnSimpanAtas").onclick = () => {
  if (!R.asli) { toast(t("pilihDulu"), true); return; }
  if (R.lihat !== "studio" && $("#gayaRapikan").hidden) { toast(t("asliTersimpan")); return; }
  $("#btnSimpanStudio").click();
};

// ================= Magic Vocal =================
const TINGKAT = { natural: { k: 60, cepat: 0.12, gema: 8 }, pop: { k: 85, cepat: 0.06, gema: 12 }, autotune: { k: 100, cepat: 0, gema: 10 } };
const namaKunci = (k) => (k ? magic.NADA[k.tonik] + " " + t(k.mayor ? "kMayor" : "kMinor") : "");
const MV = { pilihKunci: "auto", kunciAuto: null, tingkat: "pop", kekuatan: 85, langkah: { nada: true, dinamika: true, rantai: true, master: true }, untuk: null, kunci: null, lacak: null, sibuk: false, ren: null, awalGrafik: 0 };
function tutupMagic() { $("#mvPop").hidden = true; }
function tampilMV() {
  $$("#mvTingkat [data-tk]").forEach((d) => d.classList.toggle("on", d.dataset.tk === MV.tingkat));
  const k = $("#mvKekuatan"); k.value = MV.kekuatan; isiSlider(k); $("#mvKekuatanNilai").textContent = MV.kekuatan + "%";
  $$(".mv-langkah .sw").forEach((s) => s.classList.toggle("off", !MV.langkah[s.dataset.lk]));
  $("#mvKunci").textContent = MV.kunci ? t("mvKunciLagu") + ": " + namaKunci(MV.kunci) : t("mvKunciBaca");
  $("#mvKunciKet").textContent = MV.pilihKunci !== "auto" ? t("kDipilih") : R.musik ? t("mvKunciKet") : t("mvKunciKetVokal");
  const opsi = [{ nilai: "auto", label: t("kOtomatis"), ket: MV.kunciAuto ? namaKunci(MV.kunciAuto) : t("mvKunciBaca"), ikon: "bi-magic" }];
  for (const mayor of [true, false]) for (let tk = 0; tk < 12; tk++) {
    const det = MV.kunciAuto && MV.kunciAuto.tonik === tk && MV.kunciAuto.mayor === mayor;
    opsi.push({ nilai: tk + (mayor ? "M" : "m"), label: namaKunci({ tonik: tk, mayor }), ket: det ? t("kTerdeteksi") : "", ikon: mayor ? "bi-music-note" : "bi-music-note-beamed" });
  }
  dropdown($("#ddKunci"), { opsi, nilai: MV.pilihKunci, kepala: t("pilihKunci"), onPilih: (v) => {
    MV.pilihKunci = v;
    MV.kunci = v === "auto" ? MV.kunciAuto : { tonik: parseInt(v, 10), mayor: v.endsWith("M") };
    tampilMV();
  } });
}
async function siapkanAnalisaMagic() {
  if (MV.untuk === R.nama && MV.kunciAuto) return;
  MV.untuk = R.nama; MV.kunci = null; MV.kunciAuto = null; MV.pilihKunci = "auto"; MV.lacak = null; tampilMV();
  // kunci lagu dibaca dari jalur musik; rekaman vokal saja memakai perkiraan dari nada vokal
  const k = await magic.deteksiKunci(R.musik || R.asli, R.rate);
  if (MV.untuk !== R.nama) return;
  MV.kunciAuto = k; if (MV.pilihKunci === "auto") MV.kunci = k;
  tampilMV();
}
$("#btnMagic").onclick = (e) => {
  e.stopPropagation();
  if (!R.asli) { toast(t("pilihDulu"), true); return; }
  if (!R.musik && !bisaMagicTanpaMusik()) { toast(t(P.imporCampur && P.imporCampur[R.nama] ? "magicCampur" : "magicButuh2"), true); return; }
  const pop = $("#mvPop");
  if (!pop.hidden) { tutupMagic(); return; }
  tutupDropdown(); pop.hidden = false; tampilMV();
  // panel dibuka ke atas tombol (editor ada di bawah layar)
  const r = $("#btnMagic").getBoundingClientRect(), kiri = Math.max(12, Math.min(r.left + r.width / 2 - 210, innerWidth - 432));
  pop.style.left = kiri + "px"; pop.style.bottom = (innerHeight - r.top + 10) + "px";
  $("#mvPanah").style.left = (r.left + r.width / 2 - kiri - 7) + "px";
  siapkanAnalisaMagic();
};
$("#mvPop").addEventListener("click", (e) => { e.stopPropagation(); tutupDropdown(); });
document.addEventListener("click", () => { if (!MV.sibuk) tutupMagic(); });
$("#mvTutup").onclick = tutupMagic;
$$("#mvTingkat [data-tk]").forEach((d) => (d.onclick = () => { MV.tingkat = d.dataset.tk; MV.kekuatan = TINGKAT[MV.tingkat].k; tampilMV(); }));
$("#mvKekuatan").addEventListener("input", (e) => { MV.kekuatan = +e.target.value; tampilMV(); });
$$(".mv-langkah .sw").forEach((s) => (s.onclick = () => { MV.langkah[s.dataset.lk] = !MV.langkah[s.dataset.lk]; tampilMV(); }));
$("#mvProses").onclick = async () => {
  if (MV.sibuk || !R.asli || (!R.musik && !bisaMagicTanpaMusik())) return;
  MV.sibuk = true; const tombol = $("#mvProses"), teks = tombol.querySelector("span"); tombol.disabled = true;
  const kemajuan = (p) => (teks.textContent = t("mvMemproses").replace("{p}", Math.round(p * 100)));
  try {
    kemajuan(0.02); await siapkanAnalisaMagic();
    if (!MV.lacak) MV.lacak = await magic.lacakNada(R.asli, R.rate, (p) => kemajuan(0.05 + p * 0.55));
    const tk = TINGKAT[MV.tingkat];
    let v = R.asli; MV.ren = null;
    if (MV.langkah.nada) { MV.ren = magic.rencanaKoreksi(MV.lacak, MV.kunci, MV.kekuatan / 100, tk.cepat); v = await magic.terapkanKoreksi(v, R.rate, MV.lacak, MV.ren, (p) => kemajuan(0.6 + p * 0.3)); }
    else MV.ren = magic.rencanaKoreksi(MV.lacak, MV.kunci, 0, tk.cepat);
    kemajuan(0.92);
    if (MV.langkah.dinamika) v = magic.setarakanDinamika(v, R.rate);
    R.vokalMagic = v; R.magicAktif = true;
    // rantai efek: rantai vokal studio dan mastering
    if (!R.pita) R.pita = dsp.profilPita(R.asli, R.rate);
    const s = dsp.setelanOtomatis(R.analisa, R.pita, 2);
    if (MV.langkah.rantai) Object.assign(s, { gemaAktif: true, gema: tk.gema, desisSAktif: true, penyeimbangAktif: true, penyeimbang: 55, vokalMaju: true });
    else Object.assign(s, { eqAktif: false, eqCocok: null, vokalMaju: false, penyeimbangAktif: false, gemaAktif: false, desisAktif: false, desisSAktif: false, kilauAktif: false });
    s.keraskanAktif = MV.langkah.master;
    $("#gayaRapikan").hidden = true;
    terapkanSetelan(s); setLihat("studio");
    const st = MV.ren.stat;
    $("#mvStatusJudul").textContent = t("magicVocal") + ": " + $('#mvTingkat [data-tk="' + MV.tingkat + '"] b').textContent;
    $("#mvStatusKet").textContent = t("mvKet").replace("{n}", st.nadaDikoreksi).replace("{a}", st.falsSebelum).replace("{b}", MV.langkah.nada ? st.falsSesudah : st.falsSebelum).replace("{k}", namaKunci(MV.kunci));
    $("#mvStatus").hidden = false;
    tampilGrafikNada(true);
    tutupMagic(); toast(t("mvSelesai"));
  } catch (e) { toast(e.message, true); }
  finally { MV.sibuk = false; tombol.disabled = false; teks.textContent = t("mvProses"); }
};

/** Grafik nada vokal: nada asli (abu-abu), setelah Magic Vocal (pink), nada-nada di kunci lagu (garis hijau). Jendela 15 detik. */
function tampilGrafikNada(cariAwal) {
  const ren = MV.ren, kartu = $("#kartuNada");
  if (!ren || !R.magicAktif) { kartu.hidden = true; return; }
  kartu.hidden = false;
  const n = ren.asli.length, per = Math.round(15 / ren.hop);
  if (cariAwal) { // mulai dari 15 detik yang paling banyak dirapikan
    let terbaik = 0, nilai = -1;
    for (let a = 0; a + per <= n; a += Math.round(per / 3)) { let s = 0; for (let i = a; i < a + per; i++) s += Math.abs(ren.koreksi[i]); if (s > nilai) { nilai = s; terbaik = a; } }
    MV.awalGrafik = terbaik;
  }
  const a0 = MV.awalGrafik, a1 = Math.min(n, a0 + per);
  $("#nadaWaktu").textContent = waktu(a0 * ren.hop) + " – " + waktu(a1 * ren.hop);
  const st = ren.stat;
  $("#stNadaTepat").textContent = st.tepat + "%"; $("#stNadaRapi").textContent = st.nadaDikoreksi;
  $("#stNadaSisa").textContent = (MV.langkah.nada ? st.falsSesudah : st.falsSebelum) + " sen";
  $("#lgKunci").textContent = namaKunci(MV.kunci);
  const cv = $("#kanvasNada"), dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  // rentang dari nada yang wajar (persentil 5-95), supaya salah baca sesaat (loncat oktaf) tidak melebarkan grafik
  const ada = []; for (let i = a0; i < a1; i++) if (ren.asli[i]) ada.push(ren.asli[i]);
  ada.sort((p, q) => p - q);
  let lo = ada.length ? ada[Math.floor(ada.length * 0.05)] : 55, hi = ada.length ? ada[Math.floor(ada.length * 0.95)] : 67;
  lo = Math.floor(lo) - 1; hi = Math.max(lo + 7, Math.ceil(hi) + 1);
  const y = (m) => H - 12 - (m - lo) / (hi - lo) * (H - 24), x = (i) => 30 + (i - a0) / per * (W - 36);
  const skala = MV.kunci.mayor ? magic.SKALA_MAYOR : magic.SKALA_MINOR;
  g.font = "600 10px Inter, sans-serif"; g.textAlign = "left";
  for (let m = lo; m <= hi; m++) {
    if (!skala.includes(((m - MV.kunci.tonik) % 12 + 12) % 12)) continue;
    g.strokeStyle = "rgba(52,211,153,.25)"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(28, y(m) + .5); g.lineTo(W, y(m) + .5); g.stroke(); g.setLineDash([]);
    g.fillStyle = "rgba(148,163,184,.85)"; g.fillText(magic.NADA[((m % 12) + 12) % 12], 2, y(m) + 3);
  }
  const garis = (nilai, warna, tebal, alfa) => {
    g.strokeStyle = warna; g.lineWidth = tebal; g.globalAlpha = alfa; g.beginPath(); let jalan = false;
    let sebelum = 0;
    for (let i = a0; i < a1; i++) {
      const v = nilai(i);
      // lewati titik di luar rentang dan putus garis bila nada meloncat lebih dari 3 semitone (salah baca)
      if (!v || v < lo - 0.5 || v > hi + 0.5) { jalan = false; continue; }
      if (!jalan || Math.abs(v - sebelum) > 3) { g.moveTo(x(i), y(v)); jalan = true; } else g.lineTo(x(i), y(v));
      sebelum = v;
    }
    g.stroke(); g.globalAlpha = 1;
  };
  garis((i) => ren.asli[i], "#cbd5e1", 3, 0.7);
  garis((i) => ren.asli[i] && ren.asli[i] + (MV.langkah.nada ? ren.koreksi[i] : 0), "#ec4899", 2.5, 1);
}
$("#nadaKiri").onclick = () => { if (!MV.ren) return; MV.awalGrafik = Math.max(0, MV.awalGrafik - Math.round(15 / MV.ren.hop)); tampilGrafikNada(); };
$("#nadaKanan").onclick = () => { if (!MV.ren) return; MV.awalGrafik = Math.min(Math.max(0, MV.ren.asli.length - Math.round(15 / MV.ren.hop)), MV.awalGrafik + Math.round(15 / MV.ren.hop)); tampilGrafikNada(); };
$$('.tabs [data-tab="analisa"]').forEach((b) => b.addEventListener("click", () => setTimeout(() => tampilGrafikNada(), 30)));

// Kirim ke WhatsApp: WhatsApp tidak menerima WAV, jadi yang sedang didengar (Asli/Studio) disimpan sebagai M4A (AAC 192 kbps)
$("#btnWa").onclick = async () => {
  if (!R.asli) { toast(t("pilihDulu"), true); return; }
  const studio = R.lihat === "studio";
  if (studio && !R.studio) { toast(t("studioBelum")); return; }
  const data = studio ? R.studio : dataPutar(), b = $("#btnWa");
  const dasar = R.nama.replace(/s*(Studio)(s*(d+))?$/i, "") + (studio ? (R.magicAktif ? " (Magic Vocal)" : " (Studio)") : "");
  b.disabled = true; b.classList.add("sibuk"); toast(t("waMembuat"));
  try {
    const m4a = await ekspor.keM4a(data, R.rate);
    const j = await apiJson("rekaman/ekspor?" + q({ nama: dasar }), { method: "POST", body: m4a });
    toast(t("waSiap") + " (" + j.nama + ")");
  } catch (e) { toast(e.message, true); }
  finally { b.disabled = false; b.classList.remove("sibuk"); }
};

/** Rekaman vokal saja (hasil impor) boleh memakai Magic Vocal walau tanpa jalur musik. */
function bisaMagicTanpaMusik() { return !!(R.nama && P.vokalSaja && P.vokalSaja[R.nama]); }

// ================= Impor rekaman =================
async function bacaFileAudio(file) {
  const buf = await file.arrayBuffer();
  const w = dsp.bacaWav(buf.slice(0));
  if (w) return w.rate === 48000 ? w : { data: dsp.ubahRate(w.data, w.rate, 48000), rate: 48000 };
  const ac = new OfflineAudioContext(1, 1, 48000), ab = await ac.decodeAudioData(buf); // ikut diubah ke 48 kHz
  return { data: dsp.keMono(ab), rate: ab.sampleRate };
}
$("#btnImpor").onclick = () => {
  if (M.rek) return;
  const latar = document.createElement("div"); latar.className = "modal-latar";
  const terima = "audio/*,.wav,.mp3,.m4a,.aac,.ogg,.oga,.opus,.flac,.wma";
  latar.innerHTML = '<div class="modal glass impor"><h3></h3><p></p>' +
    '<label class="impor-file" id="ifRekam"><i class="bi bi-file-earmark-music"></i><div><b></b><small></small></div><input type="file" hidden accept="' + terima + '"></label>' +
    '<div class="impor-jenis">' + [["vokal", "jVokal", "jVokalK", true], ["campur", "jCampur", "jCampurK", false], ["pisah", "jPisah", "jPisahK", true]].map(([v, j, k, mg]) =>
      '<label data-j="' + v + '"><input type="radio" name="jenisImpor" value="' + v + '"><span><b>' + esc(t(j)) + "</b><small>" + esc(t(k)) + '</small></span><span class="tag ' + (mg ? "ya" : "tidak") + '">' + esc(t(mg ? "magicYa" : "magicTidak")) + "</span></label>").join("") + "</div>" +
    '<label class="impor-file" id="ifMusik" hidden><i class="bi bi-music-note-list"></i><div><b></b><small></small></div><input type="file" hidden accept="' + terima + '"></label>' +
    '<span class="lbl-nama"></span><input type="text" id="imporNama">' +
    '<div class="aksi"><button class="btn" data-a="batal"></button><button class="btn primary" data-a="ok"></button></div></div>';
  const m = latar.querySelector(".modal");
  m.querySelector("h3").textContent = t("imporJudul"); m.querySelector("p").textContent = t("imporKet");
  m.querySelector(".lbl-nama").textContent = t("imporNama");
  m.querySelector('[data-a="batal"]').textContent = t("batal"); m.querySelector('[data-a="ok"]').textContent = t("impor");
  const kotakFile = (id, judul) => { const el = m.querySelector(id); el.querySelector("b").textContent = t(judul); el.querySelector("small").textContent = t("imporKlik"); return el; };
  const ifR = kotakFile("#ifRekam", "imporPilih"), ifM = kotakFile("#ifMusik", "imporPilihMusik");
  let jenis = "campur";
  const aturJenis = (v) => { jenis = v; m.querySelectorAll(".impor-jenis label").forEach((l) => { l.classList.toggle("on", l.dataset.j === v); l.querySelector("input").checked = l.dataset.j === v; }); ifM.hidden = v !== "pisah"; };
  m.querySelectorAll(".impor-jenis label").forEach((l) => (l.onclick = () => aturJenis(l.dataset.j)));
  aturJenis(jenis);
  for (const el of [ifR, ifM]) el.querySelector("input").onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    el.classList.add("ada"); el.querySelector("b").textContent = f.name; el.querySelector("small").textContent = (f.size / 1e6).toFixed(1) + " MB";
    if (el === ifR && !m.querySelector("#imporNama").value) m.querySelector("#imporNama").value = f.name.replace(/\.[^.]+$/, "");
  };
  const tutup = () => latar.remove();
  latar.addEventListener("click", (e) => { if (e.target === latar) tutup(); });
  latar.addEventListener("keydown", (e) => { if (e.key === "Escape") tutup(); });
  m.querySelector('[data-a="batal"]').onclick = tutup;
  m.querySelector('[data-a="ok"]').onclick = async () => {
    const fR = ifR.querySelector("input").files[0], fM = ifM.querySelector("input").files[0];
    if (!fR) { toast(t("imporButuhFile"), true); return; }
    if (jenis === "pisah" && !fM) { toast(t("imporButuhMusik"), true); return; }
    const tombol = m.querySelector('[data-a="ok"]'); tombol.disabled = true; tombol.textContent = t("imporProses");
    try {
      const v = await bacaFileAudio(fR);
      const nama = (m.querySelector("#imporNama").value || fR.name).trim();
      const j = await apiJson("rekaman/simpan?" + q({ nama }), { method: "POST", body: dsp.keWav(v.data, v.rate) });
      if (jenis === "pisah") { const mu = await bacaFileAudio(fM); await apiJson("rekaman/musik-simpan?" + q({ nama: j.nama }), { method: "POST", body: dsp.keWav(mu.data, mu.rate) }); }
      if (jenis === "vokal") { P.vokalSaja = P.vokalSaja || {}; P.vokalSaja[j.nama] = true; }
      P.imporCampur = P.imporCampur || {}; if (jenis === "campur") P.imporCampur[j.nama] = true; simpanPengaturan();
      tutup(); await muatDaftar(); toast(t("imporBerhasil") + ": " + j.nama);
      const el = $('#daftar .item[data-n="' + j.nama.replace(/"/g, '\\"') + '"] b'); if (el) el.click();
    } catch (e) { toast(t("imporGagal") + ": " + e.message, true); tombol.disabled = false; tombol.textContent = t("impor"); }
  };
  document.body.appendChild(latar);
};

$("#btnSetelanSuara").onclick = () => api("setelan-suara", { method: "POST" }).catch((e) => toast(e.message, true));

// Tes suara: dua nada singkat ke speaker mode aktif
$("#btnTesSuara").onclick = async () => {
  await siapkanPemutar();
  const c = Pm.ctx, mulai = c.currentTime + 0.05;
  [[660, 0], [880, 0.22]].forEach(([f, d]) => {
    const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f;
    g.gain.setValueAtTime(0, mulai + d); g.gain.linearRampToValueAtTime(0.35, mulai + d + 0.02); g.gain.exponentialRampToValueAtTime(0.001, mulai + d + 0.2);
    o.connect(g); g.connect(c.destination); o.start(mulai + d); o.stop(mulai + d + 0.22);
  });
  toast(t("tesSuaraKet") + ": " + (M.labelOutput || "Windows"));
};

function aturTombol() {
  const ada = !!R.asli;
  $("#btnPutar").disabled = M.rek || !ada;
  $("#btnPutar i").className = "bi " + (Pm.main ? "bi-pause-fill" : "bi-play-fill");
  $("#btnPutar").title = t(Pm.main ? "jeda" : "putar");
  // ikon di daftar: ⏸ untuk rekaman yang sedang diputar, ▶ untuk yang lain
  $$("#daftar .item").forEach((el) => {
    const main = Pm.main && el.dataset.n === R.nama;
    el.classList.toggle("main", main);
    const ic = el.querySelector(".ic i"); if (ic) ic.className = "bi " + (main ? "bi-pause-fill" : "bi-play-fill");
    const b = el.querySelector(".ic"); if (b) { b.disabled = M.rek; b.title = t(main ? "jeda" : "putar"); }
  });
  $("#btnStop").disabled = !M.rek && !Pm.main;
  ["#btnGanti", "#btnHapus", "#btnDengar", "#btnSimpanStudio", "#btnSimpanAtas", "#btnRapikan", "#btnMagic", "#btnWa"].forEach((s) => ($(s).disabled = !ada || M.rek));
  $$("#modeAudio button, #pilihModeAudio button").forEach((b) => (b.disabled = M.rek));
}

// ================= Studio =================
const KUNCI_FX = ["desis", "penyeimbang", "eq", "desisS", "gema", "kilau", "keraskan"];
function tampilkanEfek() {
  const e = P.efek;
  for (const k of KUNCI_FX) {
    const el = $('.fx[data-fx="' + k + '"]'), aktif = !!e[k + "Aktif"];
    el.querySelector(".sw").classList.toggle("off", !aktif); el.classList.toggle("mati", !aktif);
    const r = el.querySelector("input[type=range]"); if (r && e[k] != null) { r.value = e[k]; isiSlider(r); }
  }
  const rn = $('.fx[data-fx="nada"] input'); rn.value = e.nada || 0; isiSlider(rn);
  $("#nadaNilai").textContent = (e.nada > 0 ? "+" : "") + (e.nada || 0);
  $$("#preset button").forEach((b) => b.classList.toggle("on", b.dataset.p === P.preset));
}
function efekBerubah() { P.efek.potongBass = 0; P.preset = ""; $$("#preset button").forEach((b) => b.classList.remove("on")); simpanPengaturan(); prosesUlang(); }
for (const k of KUNCI_FX) {
  const el = $('.fx[data-fx="' + k + '"]');
  el.querySelector(".sw").onclick = () => { P.efek[k + "Aktif"] = !P.efek[k + "Aktif"]; tampilkanEfek(); efekBerubah(); };
  const r = el.querySelector("input[type=range]");
  if (r) r.addEventListener("input", () => { P.efek[k] = +r.value; if (!P.efek[k + "Aktif"]) { P.efek[k + "Aktif"] = true; tampilkanEfek(); } efekBerubah(); });
}
$('.fx[data-fx="nada"] input').addEventListener("input", (e) => { P.efek.nada = +e.target.value; $("#nadaNilai").textContent = (P.efek.nada > 0 ? "+" : "") + P.efek.nada; efekBerubah(); });
$$("#preset button").forEach((b) => (b.onclick = () => { P.efek = { ...dsp.PRESET[b.dataset.p], nada: P.efek.nada || 0 }; P.preset = b.dataset.p; tampilkanEfek(); simpanPengaturan(); prosesUlang(); }));

const prosesUlang = tundaan(async () => {
  if (!R.asli) return;
  const versi = ++R.versi;
  R.studio = null; if (R.lihat === "studio") { if (Pm.main) hentikanPutar(); gambarGelombang(); }
  $("#btnDengar span").textContent = t("memproses");
  try {
    let hasil = await dsp.prosesStudio(R.magicAktif && R.vokalMagic ? R.vokalMagic : R.asli, R.rate, { ...P.efek, fokus: R.musik ? 0 : P.fokusVokal }, R.awal, R.akhir);
    if (R.musik && R.mixAuto) {
      // Seimbang otomatis: musik ±5 dB di bawah vokal (diukur pada bagian yang berbunyi)
      const mulai = Math.floor(R.awal * R.asli.length), akhir = Math.ceil(R.akhir * R.asli.length);
      const lv = dsp.levelAktif(hasil, R.rate), lm = dsp.levelAktif(R.musik, R.rate, mulai, akhir);
      P.mixMusik = Math.max(0, Math.min(150, Math.round(100 * Math.pow(10, (lv - 5 - lm) / 20) / 5) * 5));
      R.mixAuto = false; R.asliMix = null; simpanMix(); tampilMix();
    }
    if (R.musik) hasil = dsp.campurJalur(hasil, R.musik, R.rate, { volV: P.mixVokal / 100, volM: P.mixMusik / 100, geserMs: R.geser || 0, awal: R.awal, akhir: R.akhir, panjangAsli: R.asli.length });
    if (versi !== R.versi) return;
    R.studio = hasil; if (R.lihat === "studio") gambarGelombang();
  } catch (e) { toast(t("efekGagal") + ": " + e.message, true); }
  finally { if (versi === R.versi) $("#btnDengar span").textContent = t("dengar"); }
}, 350);

$("#btnSimpanStudio").onclick = async () => {
  if (!R.asli) return;
  if (!R.studio) { toast(t("studioBelum")); return; }
  const dasar = R.nama.replace(/\s*\(Studio\)(\s*\(\d+\))?$/i, "");
  try { const j = await apiJson("rekaman/simpan?" + q({ nama: dasar + " (Studio)" }), { method: "POST", body: dsp.keWav(R.studio, R.rate) }); await muatDaftar(); toast(t("studioTersimpan") + ": " + j.nama); }
  catch (e) { toast(t("gagalSimpan") + ": " + e.message, true); }
};

// ================= Rapikan otomatis =================
// Setelan efek dipilih otomatis dari hasil analisa rekaman (tanpa internet, tanpa API).
function terapkanSetelan(s) {
  P.efek = { desisAktif: s.desisAktif, desis: s.desis, penyeimbangAktif: s.penyeimbangAktif, penyeimbang: s.penyeimbang, eqAktif: s.eqAktif, eq: s.eq,
    desisSAktif: s.desisSAktif, gemaAktif: s.gemaAktif, gema: s.gema, keraskanAktif: s.keraskanAktif, nada: s.nada || 0,
    kilauAktif: !!s.kilauAktif, kilau: s.kilau ?? 40, potongBass: s.potongBass || 0, eqCocok: s.eqCocok || null, vokalMaju: !!s.vokalMaju, hangat: !!s.hangat };
  P.preset = ""; tampilkanEfek(); simpanPengaturan(); prosesUlang();
}
$("#btnRapikan").onclick = async () => {
  if (!R.asli || !R.analisa || R.analisa.pendek) { toast(t("pilihDulu"), true); return; }
  R.magicAktif = false; $("#mvStatus").hidden = true;
  const b = $("#btnRapikan"); b.classList.remove("baru"); b.disabled = true; $("#btnRapikan span").textContent = t("rapikanOtoProses");
  R.pita = dsp.profilPita(R.asli, R.rate);
  const s = dsp.setelanOtomatis(R.analisa, R.pita, R.gaya || 2);
  tampilGaya(R.gaya || 2);
  // potong otomatis bagian senyap di awal/akhir (intro sepi, iklan, video yang masih memuat)
  const bs = dsp.batasSenyap(R.asli, R.rate);
  if (bs.awal > 0 || bs.akhir < 1) { R.awal = bs.awal; R.akhir = bs.akhir; s.pesan += " " + t("dipotongSenyap"); }
  terapkanSetelan(s); setLihat("studio");
  // tunggu hasil studio selesai diproses
  for (let i = 0; i < 100 && !R.studio; i++) await tunggu(100);
  b.disabled = false; $("#btnRapikan span").textContent = t("rapikanOto");
  toast(t("dirapikan") + ". " + s.pesan.replace(/^Setelan otomatis:\s*/i, ""));
};

// ================= Analisa =================
function tampilkanAnalisa() {
  const h = R.analisa, set = (id, nilai, ket, ok) => { $(id).textContent = nilai; const em = $(id + "Ket"); em.innerHTML = ket ? '<i class="bi ' + (ok ? "bi-check2" : "bi-exclamation") + '"></i>' + esc(ket) : ""; em.style.color = ok ? "" : "var(--warn)"; };
  if (!h || h.pendek) {
    ["#stPecah", "#stSenyap", "#stBass", "#stJelas"].forEach((id) => set(id, "–", "", true));
    $("#bands").innerHTML = ""; $("#tip").style.background = ""; $("#tip").style.borderColor = "";
    $("#tip div").textContent = t("pilihUntukAnalisa"); return;
  }
  const n = dsp.nilaiAnalisa(h);
  set("#stPecah", ...n.kartu.pecah); set("#stSenyap", ...n.kartu.senyap); set("#stBass", ...n.kartu.bass); set("#stJelas", ...n.kartu.jelas);
  const pita = [["Getaran", "<80 Hz", h.getaran, false], ["Bass", "80–300", h.bass, h.bass <= 50], ["Badan", "300–1,2k", h.badan, true], ["Jelas", "1,2–5k", h.kejelasan, h.kejelasan >= 10], ["Udara", ">5k", h.udara, false]];
  $("#bands").innerHTML = pita.map(([nama, ket, v, ok]) => '<div class="band"><strong>' + Math.round(v) + '%</strong><div class="b' + (ok ? " ok" : "") + '" style="height:' + Math.max(3, Math.min(100, v * 1.3)) + '%"></div><small>' + nama + "<br>" + esc(ket) + "</small></div>").join("");
  $("#tip").style.background = n.bagus ? "" : "rgba(251,191,36,.12)"; $("#tip").style.borderColor = n.bagus ? "" : "rgba(251,191,36,.35)";
  $("#tip div").innerHTML = n.saran.map((s, i) => (i === 0 && n.bagus ? "<b>" + esc(s) + "</b>" : "• " + esc(s))).join("<br>");
}

// ================= YouTube: pemutar + kolom seperti YouTube asli =================
const YT = {
  pemutar: null, siap: false, status: -1,
  kini: null,                // { id, judul, channel, url }
  terkait: [],               // saran "Berikutnya" dari YouTube
  antrian: null,             // { jenis: "playlist"|"channel", judul, item: [...], i, acak, ulangi }
  tampilan: "berikutnya",    // berikutnya | cari | channel | pustaka
  cari: { kata: "", item: [] }, channel: null, pustaka: [], sejarah: [],
};
window.onYouTubeIframeAPIReady = () => { YT.siap = true; perbaruiSiap(); };
(() => { const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.onerror = () => toast(t("ytGagal"), true); document.head.appendChild(s); })();

const kartuVideo = (v, i, opsi = {}) =>
  '<div class="vi' + (YT.kini && YT.kini.id === v.id && v.jenis !== "playlist" ? " on" : "") + '" data-i="' + i + '">' +
  (opsi.nomor ? '<span class="no">' + (YT.kini && YT.kini.id === v.id ? '<i class="bi bi-play-fill" style="color:var(--p)"></i>' : i + 1) + "</span>" : "") +
  '<div class="th" style="background-image:url(https://i.ytimg.com/vi/' + esc(opsi.thumb || v.id) + '/mqdefault.jpg)">' + (v.durasi ? "<small>" + esc(durasiYt(v.durasi)) + "</small>" : "") + "</div>" +
  '<div class="t"><b>' + esc(v.judul) + "</b>" + (v.url && !opsi.tanpaChannel ? '<a class="chlink" data-ch="' + esc(v.url) + '">' + esc(v.channel) + "</a>" : "<span>" + esc(v.channel) + "</span>") + "</div>" +
  (opsi.hapus ? '<button class="mini x" data-hapus="' + i + '" title="' + esc(t("hapus")) + '"><i class="bi bi-x-lg"></i></button>' : "") + "</div>";

function pasangKlik(akar, item, aksi) {
  akar.querySelectorAll(".vi").forEach((el) => (el.onclick = (e) => {
    if (e.target.closest("[data-ch]")) { bukaChannel(e.target.closest("[data-ch]").dataset.ch); return; }
    if (e.target.closest("[data-hapus]")) return;
    aksi(item[+el.dataset.i], +el.dataset.i);
  }));
}

function kepala(judulHtml, kanan = "", kembali = true) {
  return '<div class="kolom-h"><div class="kiri">' + (kembali ? '<button class="mini" data-kembali title="' + esc(t("kembali")) + '"><i class="bi bi-arrow-left"></i></button>' : "") + judulHtml + "</div>" + kanan + "</div>";
}

/** Gambar kolom kanan sesuai tampilan aktif. */
function tampilkanKolom() {
  const k = $("#kolom");
  if (YT.tampilan === "cari") {
    k.innerHTML = kepala("<b>" + esc(t("hasilUntuk")) + " \"" + esc(YT.cari.kata) + "\"</b>") + '<div class="daftar-yt">' +
      (YT.cari.item === null ? '<div class="info">' + esc(t("memuat")) + "</div>" : YT.cari.item.length ? YT.cari.item.map((v, i) => kartuVideo(v, i)).join("") : '<div class="info">' + esc(t("tidakAdaHasil")) + "</div>") + "</div>";
    if (YT.cari.item) pasangKlik(k, YT.cari.item, (v) => { YT.antrian = null; putarVideo(v); });
  } else if (YT.tampilan === "channel") {
    const c = YT.channel || {};
    const tabs = '<div class="seg" style="flex:none"><button data-tab-ch="videos" class="' + (c.tab === "videos" ? "on" : "") + '">' + esc(t("video")) + '</button><button data-tab-ch="playlists" class="' + (c.tab === "playlists" ? "on" : "") + '">' + esc(t("playlist")) + "</button></div>";
    k.innerHTML = kepala("<b>" + esc(c.nama || t("memuat")) + "</b>") +
      '<div class="chkepala">' + (c.foto ? '<img src="' + esc(c.foto) + '" alt="">' : "") + '<div style="flex:1">' + tabs + "</div>" +
      (c.tab === "videos" && c.item && c.item.length ? '<button class="btn primary" id="putarSemuaCh"><i class="bi bi-play-fill"></i>' + esc(t("putarSemua")) + "</button>" : "") + "</div>" +
      '<div class="daftar-yt">' + (!c.item ? '<div class="info">' + esc(t("memuat")) + "</div>" : c.item.length ? c.item.map((v, i) => kartuVideo(v, i, { tanpaChannel: true, thumb: v.jenis === "playlist" ? null : v.id })).join("") : '<div class="info">' + esc(t("tidakAdaHasil")) + "</div>") + "</div>";
    k.querySelectorAll("[data-tab-ch]").forEach((b) => (b.onclick = () => bukaChannel(c.url, b.dataset.tabCh)));
    if ($("#putarSemuaCh")) $("#putarSemuaCh").onclick = () => mulaiAntrian({ jenis: "channel", judul: c.nama, item: c.item.filter((v) => v.jenis === "video") }, 0, true);
    if (c.item) {
      // Gambar kecil playlist channel: pakai gambar video pertama yang tersedia dari YouTube
      k.querySelectorAll(".vi").forEach((el) => { const v = c.item[+el.dataset.i]; if (v.jenis === "playlist") el.querySelector(".th").style.backgroundImage = "linear-gradient(135deg, rgba(var(--p-rgb),.8), rgba(0,0,0,.6))"; });
      pasangKlik(k, c.item, (v, i) => (v.jenis === "playlist" ? bukaPlaylist({ id: v.id, judul: v.judul }) : mulaiAntrian({ jenis: "channel", judul: c.nama, item: c.item.filter((x) => x.jenis === "video") }, c.item.filter((x) => x.jenis === "video").indexOf(v))));
    }
  } else if (YT.tampilan === "pustaka") {
    k.innerHTML = kepala("<b>" + esc(t("playlistSaya")) + "</b>") +
      '<form class="tempel" id="formTempel"><input id="linkTempel" placeholder="' + esc(t("tempelLink")) + '"><button class="btn primary" type="submit"><i class="bi bi-plus-lg"></i>' + esc(t("tambah")) + "</button></form>" +
      '<div class="daftar-yt">' + (YT.pustaka.length ? YT.pustaka.map((p, i) =>
        '<div class="vi" data-i="' + i + '"><div class="th" style="background-image:url(https://i.ytimg.com/vi/' + esc(p.thumb || "") + '/mqdefault.jpg)">' + (p.jumlah ? "<small>" + esc(p.jumlah) + "</small>" : "") + '</div><div class="t"><b>' + esc(p.judul) + "</b><span>" + esc(p.dari || "") + '</span></div><button class="mini x" data-hapus="' + i + '"><i class="bi bi-x-lg"></i></button></div>').join("")
        : '<div class="info">' + esc(t("pustakaKosong")) + "</div>") + "</div>";
    $("#formTempel").onsubmit = (e) => { e.preventDefault(); tambahPustaka($("#linkTempel").value.trim()); };
    pasangKlik(k, YT.pustaka, (p) => bukaPlaylist(p));
    k.querySelectorAll("[data-hapus]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); YT.pustaka.splice(+b.dataset.hapus, 1); simpanPustaka(); tampilkanKolom(); }));
  } else {
    // Berikutnya (seperti YouTube): kotak playlist/antrian di atas, lalu saran YouTube
    const a = YT.antrian;
    const kotak = a ? '<div class="plbox"><div class="kepala"><i class="bi bi-music-note-list" style="color:var(--p)"></i><div style="min-width:0"><b style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.judul) + "</b><span>" +
      esc(t(a.jenis === "channel" ? "video" : "playlist")) + " · " + (a.i + 1) + " / " + a.item.length + '</span></div><div class="aksi">' +
      '<button class="mini' + (a.ulangi ? " on" : "") + '" id="plUlangi" title="' + esc(t("ulangi")) + '"><i class="bi bi-repeat"></i></button>' +
      '<button class="mini' + (a.acak ? " on" : "") + '" id="plAcak" title="' + esc(t("acak")) + '"><i class="bi bi-shuffle"></i></button>' +
      '<button class="mini" id="plTutup" title="' + esc(t("tutupPlaylist")) + '"><i class="bi bi-x-lg"></i></button></div></div><div class="isi" id="plIsi">' +
      a.item.map((v, i) => kartuVideo(v, i, { nomor: true, tanpaChannel: true })).join("") + "</div></div>" : "";
    k.innerHTML = kotak + kepala("<b>" + esc(t("berikutnya")) + "</b>", '<span class="autoplay"><span>' + esc(t("autoplay")) + '</span><span class="sw' + (P.autoplay ? "" : " off") + '" id="swAutoplayKolom"></span></span>', false) +
      '<div class="daftar-yt" id="dTerkait">' + (YT.kini ? (YT.terkait === null ? '<div class="info">' + esc(t("memuat")) + "</div>" : YT.terkait.map((v, i) => kartuVideo(v, i)).join("")) : '<div class="info">' + esc(t("berikutnyaKosong")) + "</div>") + "</div>";
    if (a) {
      pasangKlik($("#plIsi"), a.item, (v, i) => mulaiAntrian(a, i));
      $("#plUlangi").onclick = () => { a.ulangi = !a.ulangi; tampilkanKolom(); };
      $("#plAcak").onclick = () => { a.acak = !a.acak; tampilkanKolom(); };
      $("#plTutup").onclick = () => { YT.antrian = null; tampilkanKolom(); };
      const aktif = $("#plIsi .vi.on"); if (aktif) aktif.scrollIntoView({ block: "nearest" });
    }
    if (YT.terkait) pasangKlik($("#dTerkait"), YT.terkait, (v) => { YT.antrian = null; putarVideo(v); });
    $("#swAutoplayKolom").onclick = () => { P.autoplay = !P.autoplay; terapkanTema(); tampilkanKolom(); simpanPengaturan(); };
  }
  k.querySelectorAll("[data-kembali]").forEach((b) => (b.onclick = () => { YT.tampilan = "berikutnya"; tampilkanKolom(); }));
}

// Cari
$("#cari").addEventListener("submit", async (e) => {
  e.preventDefault();
  const kata = $("#kata").value.trim(); if (!kata) return;
  simpanRiwayatCari(kata); tutupRiwayatCari(); $("#kata").blur();
  YT.cari = { kata, item: null }; YT.tampilan = "cari"; tampilkanKolom();
  try { YT.cari.item = await apiJson("cari?" + q({ q: kata })); } catch (err) { YT.cari.item = []; toast(err.message, true); }
  if (YT.tampilan === "cari") tampilkanKolom();
  // Link video ditempel: langsung putar
  if (YT.cari.item.length === 1 && YT.cari.item[0].judul === "Video dari link") { YT.antrian = null; putarVideo(YT.cari.item[0]); }
});


// ================= Riwayat pencarian =================
// Disimpan di pengaturan (laptop ini), paling baru di atas, maksimal 20.
const MAKS_RIWAYAT = 20;
let pilihanRiwayat = -1;
function simpanRiwayatCari(kata) {
  if (/^https?:\/\//i.test(kata)) return; // link yang ditempel tidak perlu disimpan
  const r = (P.riwayatCari || []).filter((x) => x.toLowerCase() !== kata.toLowerCase());
  r.unshift(kata); P.riwayatCari = r.slice(0, MAKS_RIWAYAT); simpanPengaturan();
}
function daftarRiwayatCocok() {
  const q = $("#kata").value.trim().toLowerCase(), r = P.riwayatCari || [];
  return q ? r.filter((x) => x.toLowerCase().includes(q) && x.toLowerCase() !== q) : r;
}
function tebalkan(teks, q) {
  if (!q) return esc(teks);
  const i = teks.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(teks) : esc(teks.slice(0, i)) + "<b>" + esc(teks.slice(i, i + q.length)) + "</b>" + esc(teks.slice(i + q.length));
}
function tampilkanRiwayatCari() {
  const kotak = $("#riwayatCari"), daftar = daftarRiwayatCocok().slice(0, 8), q = $("#kata").value.trim();
  if (!daftar.length) { tutupRiwayatCari(); return; }
  pilihanRiwayat = Math.min(pilihanRiwayat, daftar.length - 1);
  kotak.innerHTML = '<div class="kepala-r"><span>' + esc(t("riwayatCari")) + '</span><button type="button" data-hapus-semua>' + esc(t("hapusSemua")) + "</button></div>" +
    daftar.map((x, n) => '<div class="r' + (n === pilihanRiwayat ? " aktif" : "") + '" data-kata="' + esc(x) + '"><i class="bi bi-clock-history"></i><span>' + tebalkan(x, q) +
      '</span><button type="button" class="x" data-hapus="' + esc(x) + '" title="' + esc(t("hapus")) + '"><i class="bi bi-x-lg"></i></button></div>').join("");
  kotak.hidden = false;
}
function tutupRiwayatCari() { $("#riwayatCari").hidden = true; pilihanRiwayat = -1; }
function cariDariRiwayat(kata) { $("#kata").value = kata; $("#cari").requestSubmit(); }

$("#kata").addEventListener("focus", () => { pilihanRiwayat = -1; tampilkanRiwayatCari(); });
$("#kata").addEventListener("input", () => { pilihanRiwayat = -1; tampilkanRiwayatCari(); });
$("#kata").addEventListener("keydown", (e) => {
  const daftar = daftarRiwayatCocok().slice(0, 8);
  if ($("#riwayatCari").hidden || !daftar.length) return;
  if (e.key === "ArrowDown") { e.preventDefault(); pilihanRiwayat = (pilihanRiwayat + 1) % daftar.length; tampilkanRiwayatCari(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); pilihanRiwayat = pilihanRiwayat <= 0 ? daftar.length - 1 : pilihanRiwayat - 1; tampilkanRiwayatCari(); }
  else if (e.key === "Enter" && pilihanRiwayat >= 0) { e.preventDefault(); cariDariRiwayat(daftar[pilihanRiwayat]); }
  else if (e.key === "Escape") tutupRiwayatCari();
});
// mousedown supaya terpilih sebelum kotak cari kehilangan fokus
$("#riwayatCari").addEventListener("mousedown", (e) => {
  e.preventDefault();
  const hapus = e.target.closest("[data-hapus]"), semua = e.target.closest("[data-hapus-semua]"), baris = e.target.closest("[data-kata]");
  if (semua) { P.riwayatCari = []; simpanPengaturan(); tutupRiwayatCari(); return; }
  if (hapus) { P.riwayatCari = (P.riwayatCari || []).filter((x) => x !== hapus.dataset.hapus); simpanPengaturan(); tampilkanRiwayatCari(); return; }
  if (baris) cariDariRiwayat(baris.dataset.kata);
});
$("#kata").addEventListener("blur", () => setTimeout(tutupRiwayatCari, 120));

// Playlist saya (tersimpan di laptop)
async function muatPustaka() { try { const j = await apiJson("perpustakaan"); YT.pustaka = j.playlist || []; } catch { YT.pustaka = []; } }
const simpanPustaka = () => api("perpustakaan", { method: "POST", body: JSON.stringify({ playlist: YT.pustaka }) }).catch(() => {});
$("#btnPustaka").onclick = () => { YT.tampilan = YT.tampilan === "pustaka" ? "berikutnya" : "pustaka"; tampilkanKolom(); };

async function tambahPustaka(link) {
  if (!link) return;
  try {
    let tambah = 0;
    const masuk = (p) => { if (YT.pustaka.some((x) => x.id === p.id)) return; YT.pustaka.push(p); tambah++; };
    if (/[?&]list=/.test(link)) {
      const j = await apiJson("playlist-yt?" + q({ link }));
      masuk({ id: j.id, judul: j.judul, jumlah: j.video.length + " " + t("lagu"), thumb: j.video[0]?.id || "", dari: "YouTube" });
    } else {
      const c = await apiJson("channel?" + q({ url: link, tab: "playlists" }));
      for (const p of c.item) {
        // ambil satu video pertama untuk gambar kecil (tanpa memuat seluruh playlist)
        masuk({ id: p.id, judul: p.judul, jumlah: p.durasi || "", thumb: "", dari: t("dariChannel") + " " + c.nama });
      }
    }
    simpanPustaka(); tampilkanKolom(); toast(tambah ? t("playlistDitambah") + " (" + tambah + ")" : t("playlistAda"));
  } catch (e) { toast(e.message, true); }
}

async function bukaPlaylist(p) {
  try {
    const j = await apiJson("playlist-yt?" + q({ link: p.id }));
    const simpan = YT.pustaka.find((x) => x.id === p.id);
    if (simpan && !simpan.thumb && j.video[0]) { simpan.thumb = j.video[0].id; simpan.jumlah = j.video.length + " " + t("lagu"); simpanPustaka(); }
    mulaiAntrian({ jenis: "playlist", judul: j.judul, item: j.video }, 0);
  } catch (e) { toast(e.message, true); }
}

async function bukaChannel(url, tab = "videos") {
  if (!url) return;
  YT.channel = { url, tab, nama: YT.channel && YT.channel.url === url ? YT.channel.nama : "", item: null }; YT.tampilan = "channel"; tampilkanKolom();
  try { const c = await apiJson("channel?" + q({ url, tab })); YT.channel = { ...c, tab }; }
  catch (e) { YT.channel.item = []; toast(e.message, true); }
  if (YT.tampilan === "channel") tampilkanKolom();
}
$("#ytChannel").onclick = () => { if (YT.kini && YT.kini.url) bukaChannel(YT.kini.url); };

function mulaiAntrian(a, i, langsung = false) {
  if (!a.item.length) return;
  YT.antrian = { ...a, i: Math.max(0, i), acak: a.acak || false, ulangi: a.ulangi !== false };
  YT.tampilan = "berikutnya";
  putarVideo(YT.antrian.item[YT.antrian.i], langsung);
}

/**
 * Buka satu video lalu ambil "Berikutnya" dan data channel dari YouTube.
 * langsung=false (memilih lagu): video hanya disiapkan, menunggu tombol Rekam (rekam bersama lagu) atau Putar (dengar saja).
 * langsung=true (Putar semua, Berikutnya, Sebelumnya, putar otomatis): langsung diputar.
 */
async function putarVideo(v, langsung = false) {
  if (!v) return;
  if (P.modeKerja === "youtube" && !M.rek) langsung = true;
  if (!YT.siap) { toast(t("ytBelumSiap"), true); return; }
  if (YT.kini && YT.kini.id !== v.id) YT.sejarah.push(YT.kini);
  YT.kini = { ...v }; YT.terkait = null;
  if (YT.tampilan !== "channel" && YT.tampilan !== "pustaka") YT.tampilan = "berikutnya";
  $("#ytKosong").hidden = true;
  $("#ytJudul").removeAttribute("data-t");
  tampilkanKini();
  if (!YT.pemutar) {
    YT.pemutar = new YT_API.Player("ytPlayer", {
      videoId: v.id, playerVars: { autoplay: langsung ? 1 : 0, rel: 0, playsinline: 1, origin: location.origin },
      events: {
        onStateChange: (e) => { YT.status = e.data; perbaruiTombolYt(); perbaruiSiap(); if (e.data === 0) laguSelesai(); },
        onError: (e) => { if ([100, 101, 150].includes(e.data)) { toast(t("ytTidakBoleh"), true); laguBerikutnya(); } },
      },
    });
  } else if (langsung) YT.pemutar.loadVideoById(v.id); else YT.pemutar.cueVideoById(v.id);
  if (!langsung && !M.rek) toast(t("laguSiap"));
  tampilkanKolom();
  try {
    const j = await apiJson("terkait?" + q({ id: v.id }));
    if (YT.kini.id !== v.id) return;
    YT.terkait = j.video;
    if (j.judul && (!YT.kini.judul || YT.kini.judul === "Video dari link")) YT.kini.judul = j.judul;
    if (j.channel) { YT.kini.channel = j.channel; YT.kini.url = j.url || YT.kini.url; }
    tampilkanKini();
  } catch { YT.terkait = []; }
  if (YT.tampilan === "berikutnya") tampilkanKolom();
}
const YT_API = new Proxy({}, { get: (_, k) => window.YT[k] });

function tampilkanKini() {
  const v = YT.kini; if (!v) return;
  $("#ytJudul").textContent = v.judul;
  $("#ytChannel").textContent = v.channel || ""; $("#ytChannel").style.cursor = v.url ? "pointer" : "default";
  $("#ytInfo").textContent = v.durasi ? " · " + durasiYt(v.durasi) : "";
}
function perbaruiTombolYt() {
  const main = YT.status === 1 || YT.status === 3;
  $("#ytPlay").innerHTML = '<i class="bi ' + (main ? "bi-pause-fill" : "bi-play-fill") + '"></i><span>' + esc(t(main ? "jeda" : "putar")) + "</span>";
}

/** Lagu berikutnya: dari antrian (playlist/channel) bila ada, kalau tidak dari saran YouTube. */
function laguBerikutnya() {
  const a = YT.antrian;
  if (a) {
    let i = a.acak ? Math.floor(Math.random() * a.item.length) : a.i + 1;
    if (i >= a.item.length) { if (!a.ulangi) { YT.antrian = null; } else i = 0; }
    if (YT.antrian) { a.i = i; putarVideo(a.item[i], true); return; }
  }
  if (YT.terkait && YT.terkait.length) putarVideo(YT.terkait[0], true);
}
function laguSelesai() {
  if (M.rek && M.bersamaYt) { toast(t("laguBerhenti")); selesaiRekam(); return; }
  if (P.autoplay) laguBerikutnya();
}
$("#ytNext").onclick = laguBerikutnya;
$("#ytPrev").onclick = () => {
  const a = YT.antrian;
  if (a && a.i > 0) { a.i--; putarVideo(a.item[a.i], true); return; }
  const sebelum = YT.sejarah.pop(); if (sebelum) { putarVideo(sebelum, true); YT.sejarah.pop(); }
};
$("#ytPlay").onclick = () => {
  const p = YT.pemutar;
  if (!p) { if (YT.cari.item && YT.cari.item.length) putarVideo(YT.cari.item[0], true); else $("#kata").focus(); return; }
  if (YT.status === 1 || YT.status === 3) p.pauseVideo(); else p.playVideo();
};


// ================= Update otomatis (GitHub Releases) =================
let infoUpdate = null;
async function cekUpdate(manual = false) {
  try {
    const j = await apiJson("update/cek");
    $("#versiApp").textContent = j.versi;
    infoUpdate = j.ada ? j : null;
    $("#infoUpdate").hidden = !j.ada;
    $("#btnPengaturan").classList.toggle("ada-update", !!j.ada);
    if (j.ada) {
      $("#judulUpdate").textContent = t("versiBaru") + ": " + j.terbaru;
      $("#catatanUpdate").textContent = j.catatan || j.judul || "";
      if (!manual) toast(t("versiBaru") + ": " + j.terbaru + " · " + t("pengaturan"));
    } else if (manual) toast(j.galat || t("sudahTerbaru"), !!j.galat);
  } catch (e) { if (manual) toast(e.message, true); }
}
$("#btnCekUpdate").onclick = () => cekUpdate(true);
$("#btnPasangUpdate").onclick = async () => {
  if (M.rek) return;
  const layar = document.createElement("div"); layar.className = "layar-update";
  layar.innerHTML = '<div class="glass"><div class="putar"></div><b></b><span></span></div>';
  layar.querySelector("b").textContent = t("memperbarui") + (infoUpdate ? " (" + infoUpdate.terbaru + ")" : "");
  layar.querySelector("span").textContent = t("memperbaruiKet");
  document.body.appendChild(layar);
  try {
    const lama = (await apiJson("versi")).versi;
    const j = await apiJson("update/pasang", { method: "POST" });
    if (!j.ok) throw new Error(j.galat || t("updateGagal"));
    // Tunggu server versi baru menyala, lalu muat ulang jendela ini
    for (let n = 0; n < 120; n++) {
      await tunggu(1000);
      try { const v = await apiJson("versi"); if (v.versi !== lama) { location.reload(); return; } } catch {}
    }
    location.reload();
  } catch (e) { layar.remove(); toast(t("updateGagal") + ": " + e.message, true); }
};

// ================= Teks yang bergantung bahasa =================
function segarkanTeks() {
  terapkan();
  if (!YT.kini) $("#ytJudul").textContent = t("belumLagu");
  if (!R.nama) $("#namaRekaman").textContent = t("belumDipilih"); else $("#namaRekaman").textContent = R.nama;
  if (!M.rek) { $("#timerKet").textContent = t("tekanRekam"); $("#recPill span").textContent = t("siap"); }
  perbaruiTombolYt(); perbaruiRingkas(); perbaruiSiap(); tampilkanKolom(); muatDaftar(); tampilkanAnalisa(); gambarGelombang();
  $("#btnDengar span").textContent = t("dengar");
  if (laci.classList.contains("buka")) isiPengaturanAudio();
}

// ================= Mulai =================
(async function mulai() {
  try { const s = await apiJson("pengaturan"); Object.assign(P, s); P.efek = { ...EFEK_AWAL, ...(s.efek || {}) }; P.profil = { rumah: { input: "", output: "", putar: "" }, laptop: { input: "", output: "", putar: "" } };
    for (const m of ["rumah", "laptop"]) Object.assign(P.profil[m], (s.profil || {})[m] || {}); } catch {}
  if (!["rumah", "laptop"].includes(P.modeAudio)) P.modeAudio = "rumah";
  aturBahasa(P.bahasa); terapkanTema(); tampilkanEfek(); aturTombol(); tampilkanAnalisa(); tampilVolPutar(); aturSamping(P.sampingTutup); if (P.modeKerja !== "youtube") P.modeKerja = "rekam"; tampilModeKerja();
  segarkanTeks();
  await Promise.all([muatDaftar(), muatPustaka(), muatAudio()]);
  tampilkanKolom();
  // Langsung tersambung: aktifkan mode audio terakhir (Studio Rumah / Laptop)
  await aktifkanMode(P.modeAudio, true);
  // Ping supaya server tahu jendela masih terbuka; sekaligus cek versi server.
  // Bila versi berubah (aplikasi baru diperbarui), muat ulang supaya tampilan ikut versi baru.
  let versiAwal = null;
  const ping = async () => {
    try { await api("ping" + (M.rek ? "?rek=1" : "")); const v = (await apiJson("versi")).versi; if (versiAwal === null) versiAwal = v; else if (v !== versiAwal && !M.rek) location.reload(); } catch {}
  };
  setInterval(ping, 10000); ping();
  cekUpdate(false);
})();
