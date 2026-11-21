// Orulab Studio: logika tampilan.
// YouTube (pemutar resmi) + perekam + daftar rekaman + gelombang + studio + analisa.
import * as dsp from "./dsp.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const html = document.documentElement;

// ================= Bantuan umum =================
async function api(rute, opsi = {}) {
  const r = await fetch("/api/" + rute, { ...opsi, headers: { "X-Orulab": "1", ...(opsi.headers || {}) } });
  if (!r.ok) {
    let pesan = "Server menolak (" + r.status + ")";
    try { const j = await r.json(); if (j.galat) pesan = j.galat; } catch {}
    throw new Error(pesan);
  }
  return r;
}
const apiJson = async (rute, opsi) => (await api(rute, opsi)).json();
const q = (o) => new URLSearchParams(o).toString();

function waktu(detik) {
  detik = Math.max(0, Math.floor(detik || 0));
  return String(Math.floor(detik / 60)).padStart(2, "0") + ":" + String(detik % 60).padStart(2, "0");
}
function cap(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + "." + p(d.getMinutes()) + "." + p(d.getSeconds());
}
function tundaan(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

let toastTimer;
function toast(teks, galat = false) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast glass"; document.body.appendChild(t); }
  t.className = "toast glass" + (galat ? " galat" : "");
  t.innerHTML = '<i class="bi ' + (galat ? "bi-exclamation-circle-fill" : "bi-check-circle-fill") + '"></i><span></span>';
  t.querySelector("span").textContent = teks;
  t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), galat ? 6000 : 3200);
}

/** Dialog kaca. Mengembalikan isi input (atau true) bila OK, null bila batal. */
function dialog({ judul, teks = "", input = null, sandi = false, ok = "Simpan", bahaya = false }) {
  return new Promise((selesai) => {
    const latar = document.createElement("div"); latar.className = "modal-latar";
    latar.innerHTML = '<div class="modal glass"><h3></h3><p></p>' + (input !== null ? '<input type="' + (sandi ? "password" : "text") + '">' : "") +
      '<div class="aksi"><button class="btn" data-a="batal">Batal</button><button class="btn ' + (bahaya ? "bahaya" : "primary") + '" data-a="ok"></button></div></div>';
    latar.querySelector("h3").textContent = judul; latar.querySelector("p").textContent = teks;
    latar.querySelector('[data-a="ok"]').textContent = ok;
    const inp = latar.querySelector("input"); if (inp) inp.value = input;
    const tutup = (v) => { latar.remove(); selesai(v); };
    latar.addEventListener("click", (e) => { if (e.target === latar) tutup(null); });
    latar.querySelector('[data-a="batal"]').onclick = () => tutup(null);
    latar.querySelector('[data-a="ok"]').onclick = () => tutup(inp ? inp.value : true);
    latar.addEventListener("keydown", (e) => { if (e.key === "Enter") tutup(inp ? inp.value : true); if (e.key === "Escape") tutup(null); });
    document.body.appendChild(latar);
    (inp || latar.querySelector('[data-a="ok"]')).focus();
    if (inp) inp.select();
  });
}

// ================= Pengaturan (warna, mode, perangkat, efek) =================
const EFEK_AWAL = { ...dsp.PRESET.pop, nada: 0 };
const P = { warna: "biru", mode: "glass-dark", input: "", output: "", preset: "pop", efek: { ...EFEK_AWAL } };
const simpanPengaturan = tundaan(() => api("pengaturan", { method: "POST", body: JSON.stringify(P) }).catch(() => {}), 600);

function terapkanTema() {
  html.setAttribute("data-warna", P.warna);
  html.setAttribute("data-ol-skin", P.mode);
  $$("#warna button").forEach((b) => b.classList.toggle("on", b.dataset.w === P.warna));
  $$("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === P.mode));
  gambarGelombang();
}
$$("#warna button").forEach((b) => (b.onclick = () => { P.warna = b.dataset.w; terapkanTema(); simpanPengaturan(); }));
$$("#mode button").forEach((b) => (b.onclick = () => { P.mode = b.dataset.m; terapkanTema(); simpanPengaturan(); }));

// Tab Studio / Analisa
$$(".tabs button").forEach((b) => (b.onclick = () => {
  $$(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $$(".pane").forEach((p) => p.classList.toggle("on", p.id === b.dataset.tab));
}));

// Slider kaca: isi bagian yang sudah dilewati
function isiSlider(r) { r.style.setProperty("--v", ((r.value - r.min) / (r.max - r.min)) * 100 + "%"); }
$$('input[type=range]').forEach((r) => { isiSlider(r); r.addEventListener("input", () => isiSlider(r)); });

// ================= YouTube =================
const YT_STATE = { pemutar: null, siap: false, hasil: [], halaman: 0, aktif: -1, status: -1 };
const PER_HALAMAN = 4;

window.onYouTubeIframeAPIReady = () => { YT_STATE.siap = true; perbaruiSiap(); };
(function muatYouTube() {
  const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api";
  s.onerror = () => toast("Pemutar YouTube tidak bisa dimuat. Cek koneksi internet.", true);
  document.head.appendChild(s);
})();

$("#cari").addEventListener("submit", async (e) => {
  e.preventDefault();
  const kata = $("#kata").value.trim(); if (!kata) return;
  $("#hasil").innerHTML = '<div class="info"><span class="proses"><span class="putar"></span>Mencari di YouTube…</span></div>';
  try {
    YT_STATE.hasil = await apiJson("cari?" + q({ q: kata }));
    YT_STATE.halaman = 0;
    tampilkanHasil();
    if (!YT_STATE.hasil.length) $("#hasil").innerHTML = '<div class="info">Tidak ada hasil. Coba kata lain.</div>';
  } catch (err) {
    $("#hasil").innerHTML = '<div class="info">Pencarian gagal: ' + esc(err.message) + "</div>";
  }
});

function tampilkanHasil() {
  const h = YT_STATE.hasil, mulai = YT_STATE.halaman * PER_HALAMAN;
  $("#hasil").innerHTML = h.slice(mulai, mulai + PER_HALAMAN).map((v, i) =>
    '<div class="res' + (mulai + i === YT_STATE.aktif ? " on" : "") + '" data-i="' + (mulai + i) + '" title="' + esc(v.judul) + '">' +
    '<div class="thumb" style="background-image:url(https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg)">' + (v.durasi ? "<small>" + esc(v.durasi.replace(".", ":")) + "</small>" : "") + "</div>" +
    "<div><b>" + esc(v.judul) + "</b><span>" + esc(v.channel) + "</span></div></div>").join("");
  $$("#hasil .res").forEach((el) => (el.onclick = () => putarVideo(+el.dataset.i)));
  $("#resPrev").disabled = YT_STATE.halaman === 0;
  $("#resNext").disabled = mulai + PER_HALAMAN >= h.length;
}
$("#resPrev").onclick = () => { YT_STATE.halaman--; tampilkanHasil(); };
$("#resNext").onclick = () => { YT_STATE.halaman++; tampilkanHasil(); };

function putarVideo(i) {
  const v = YT_STATE.hasil[i]; if (!v) return;
  if (!YT_STATE.siap) { toast("Pemutar YouTube belum siap, tunggu sebentar.", true); return; }
  YT_STATE.aktif = i;
  YT_STATE.halaman = Math.floor(i / PER_HALAMAN); tampilkanHasil();
  $("#ytKosong").hidden = true;
  $("#ytJudul").textContent = v.judul;
  $("#ytInfo").textContent = v.channel + (v.durasi ? " · " + v.durasi.replace(".", ":") : "");
  if (!YT_STATE.pemutar) {
    YT_STATE.pemutar = new YT.Player("ytPlayer", {
      videoId: v.id,
      playerVars: { autoplay: 1, rel: 0, playsinline: 1, origin: location.origin },
      events: {
        onStateChange: (e) => { YT_STATE.status = e.data; perbaruiTombolYt(); perbaruiSiap(); },
        onError: (e) => {
          if (e.data === 101 || e.data === 150 || e.data === 100) {
            toast("Video ini tidak boleh diputar di aplikasi lain. Pindah ke hasil berikutnya.", true);
            if (YT_STATE.aktif + 1 < YT_STATE.hasil.length) putarVideo(YT_STATE.aktif + 1);
          }
        },
      },
    });
  } else YT_STATE.pemutar.loadVideoById(v.id);
}
function perbaruiTombolYt() {
  const main = YT_STATE.status === 1 || YT_STATE.status === 3;
  $("#ytPlay").innerHTML = main ? '<i class="bi bi-pause-fill"></i><span>Jeda</span>' : '<i class="bi bi-play-fill"></i><span>Putar</span>';
}
$("#ytPlay").onclick = () => {
  const p = YT_STATE.pemutar;
  if (!p) { if (YT_STATE.hasil.length) putarVideo(0); else $("#kata").focus(); return; }
  if (YT_STATE.status === 1 || YT_STATE.status === 3) p.pauseVideo(); else p.playVideo();
};
$("#ytPrev").onclick = () => { if (YT_STATE.aktif > 0) putarVideo(YT_STATE.aktif - 1); };
$("#ytNext").onclick = () => { if (YT_STATE.aktif + 1 < YT_STATE.hasil.length) putarVideo(YT_STATE.aktif + 1); };

// ================= Perangkat & monitor level =================
const M = { ctx: null, stream: null, node: null, rek: false, potongan: [], puncak: 0, tampil: 0, riwayat: [], mulai: 0, timer: null };
const KODE_WORKLET = `
class PerekamOrulab extends AudioWorkletProcessor {
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
registerProcessor("perekam-orulab", PerekamOrulab);`;

const namaWindows = (label) => (label || "").replace(/^(Default|Communications|Bawaan|Komunikasi)\s*-\s*/i, "");

async function isiPerangkat() {
  try {
    if (!M.izin) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop()); M.izin = true;
    }
  } catch {
    $("#timerKet").textContent = "Izinkan akses mikrofon supaya bisa merekam";
    toast("Akses mikrofon ditolak. Klik ikon gembok di bar alamat lalu izinkan Mikrofon.", true);
    return;
  }
  const semua = await navigator.mediaDevices.enumerateDevices();
  const masuk = semua.filter((d) => d.kind === "audioinput" && d.deviceId !== "communications");
  const keluar = semua.filter((d) => d.kind === "audiooutput" && d.deviceId !== "communications");
  const isi = (sel, daftar, simpan, cadangan) => {
    sel.innerHTML = daftar.map((d) => '<option value="' + esc(d.deviceId) + '">' + esc(d.label || "Perangkat") + "</option>").join("");
    const cocok = daftar.find((d) => d.label === simpan) || (cadangan && daftar.find((d) => cadangan.test(d.label) && d.deviceId !== "default")) || daftar[0];
    if (cocok) sel.value = cocok.deviceId;
  };
  isi($("#pilihInput"), masuk, P.input, /YA USB|USB Audio/i);
  isi($("#pilihOutput"), keluar, P.output, null);
  await mulaiMonitor();
}
navigator.mediaDevices.addEventListener("devicechange", tundaan(() => { if (!M.rek) isiPerangkat(); }, 800));

$("#pilihInput").onchange = () => { P.input = $("#pilihInput").selectedOptions[0]?.textContent || ""; simpanPengaturan(); mulaiMonitor(); };
$("#pilihOutput").onchange = () => { P.output = $("#pilihOutput").selectedOptions[0]?.textContent || ""; simpanPengaturan(); };

async function mulaiMonitor() {
  const id = $("#pilihInput").value; if (!id) return;
  if (M.stream) M.stream.getTracks().forEach((t) => t.stop());
  try {
    M.stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
  } catch (e) { toast("Perangkat rekam tidak bisa dibuka: " + e.message, true); return; }
  if (!M.ctx) {
    M.ctx = new AudioContext({ latencyHint: "interactive" });
    const url = URL.createObjectURL(new Blob([KODE_WORKLET], { type: "text/javascript" }));
    await M.ctx.audioWorklet.addModule(url);
  }
  if (M.sumber) M.sumber.disconnect();
  M.sumber = M.ctx.createMediaStreamSource(M.stream);
  if (!M.node) {
    M.node = new AudioWorkletNode(M.ctx, "perekam-orulab");
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
  bacaVolume();
  perbaruiSiap();
}
// Browser menahan audio sebelum ada klik pertama
document.addEventListener("pointerdown", () => { if (M.ctx && M.ctx.state === "suspended") M.ctx.resume(); }, true);

// Meter level hijau-kuning-merah
const segmen = [];
for (let i = 0; i < 30; i++) { const s = document.createElement("i"); $("#meter").appendChild(s); segmen.push(s); }
function animasiMeter() {
  M.tampil = Math.max(M.puncak, M.tampil * 0.86); M.puncak = 0;
  const dbv = 20 * Math.log10(Math.max(M.tampil, 1e-6)), nyala = Math.round(Math.max(0, Math.min(1, (dbv + 60) / 60)) * 30);
  segmen.forEach((s, i) => (s.style.background = i < nyala ? (i < 20 ? "#34d399" : i < 26 ? "#fbbf24" : "#ff4d5e") : ""));
  if (M.rek) $("#timer").textContent = waktu((performance.now() - M.mulai) / 1000);
  requestAnimationFrame(animasiMeter);
}
requestAnimationFrame(animasiMeter);

// Volume input Windows
async function bacaVolume() {
  const nama = namaWindows($("#pilihInput").selectedOptions[0]?.textContent);
  try {
    const j = await apiJson("volume?" + q({ nama }));
    const ada = j.nilai >= 0; $("#volInput").disabled = !ada;
    if (ada) { $("#volInput").value = j.nilai; isiSlider($("#volInput")); }
    $("#volNilai").textContent = ada ? j.nilai + "%" : "–";
  } catch {}
}
const aturVolume = tundaan(async (v) => {
  const nama = namaWindows($("#pilihInput").selectedOptions[0]?.textContent);
  try { await api("volume?" + q({ nama, nilai: v }), { method: "POST" }); } catch {}
}, 150);
$("#volInput").addEventListener("input", (e) => { $("#volNilai").textContent = e.target.value + "%"; aturVolume(e.target.value); });

// Status "Siap rekam"
function setCek(id, ok, teks) {
  const el = $(id); el.classList.toggle("no", !ok);
  el.querySelector("i").className = "bi " + (ok ? "bi-check-circle-fill" : "bi-exclamation-circle-fill");
  if (teks) el.querySelector("span").textContent = teks;
}
function perbaruiSiap() {
  const label = $("#pilihInput").selectedOptions[0]?.textContent || "";
  const inputOk = !!(M.stream && M.stream.active);
  const converter = /YA USB|USB/i.test(label);
  const kini = performance.now(); M.riwayat = M.riwayat.filter((r) => kini - r.t < 3000);
  const maks = M.riwayat.reduce((a, r) => Math.max(a, r.p), 0), dbMaks = 20 * Math.log10(Math.max(maks, 1e-6));
  setCek("#cekInput", inputOk && converter, inputOk ? (converter ? "Converter" : "Bukan converter") : "Input mati");
  setCek("#cekOutput", !!$("#pilihOutput").value, "Speaker");
  setCek("#cekLevel", dbMaks > -30 && dbMaks < -3, dbMaks >= -3 ? "Terlalu keras" : dbMaks <= -30 ? "Level pelan" : "Level pas");
  setCek("#cekYt", YT_STATE.status === 1, YT_STATE.status === 1 ? "YouTube jalan" : "YouTube diam");
  const siap = inputOk;
  $("#siapTeks").textContent = siap ? (M.rek ? "Merekam" : "Siap rekam") : "Cek converter";
  $("#siapDot").style.background = siap ? (M.rek ? "#ff4d5e" : "") : "#fbbf24";
  $("#siap").title = "Rekam dari: " + (label || "-");
}
setInterval(perbaruiSiap, 1000);

// ================= Merekam =================
async function mulaiRekam() {
  if (!M.node || !M.stream || !M.stream.active) { toast("Perangkat rekam belum siap. Cek pilihan \"Rekam dari\".", true); return; }
  if (Pm.main) hentikanPutar();
  await M.ctx.resume();
  M.potongan = []; M.rek = true; M.node.port.postMessage(true); M.mulai = performance.now();
  $("#btnRekam").classList.add("on"); $("#btnRekam").querySelector("i").className = "bi bi-stop-fill"; $("#btnRekam").title = "Selesai merekam";
  $("#recPill").classList.remove("diam"); $("#recPill").querySelector("span").textContent = "REC";
  $("#timerKet").textContent = "Merekam · tersimpan otomatis saat Stop";
  aturTombol(); perbaruiSiap();
}

async function selesaiRekam() {
  M.node.port.postMessage(false);
  await new Promise((r) => setTimeout(r, 120));
  M.rek = false;
  $("#btnRekam").classList.remove("on"); $("#btnRekam").querySelector("i").className = "bi bi-mic-fill"; $("#btnRekam").title = "Rekam";
  $("#recPill").classList.add("diam"); $("#recPill").querySelector("span").textContent = "SIAP";
  $("#timerKet").textContent = "Tekan tombol merah untuk mulai merekam";
  aturTombol(); perbaruiSiap();
  const total = M.potongan.reduce((a, c) => a + c.length, 0), data = new Float32Array(total);
  let o = 0; for (const c of M.potongan) { data.set(c, o); o += c.length; }
  M.potongan = [];
  const rate = M.ctx.sampleRate;
  if (total < rate * 0.5) { toast("Rekaman terlalu pendek, tidak disimpan.", true); return; }
  try {
    const j = await apiJson("rekaman/simpan?" + q({ nama: "Rekaman " + cap(new Date()) }), { method: "POST", body: dsp.keWav(data, rate) });
    toast("Tersimpan: " + j.nama);
    await muatDaftar();
    tampilkanRekaman(j.nama, data, rate);
  } catch (e) { toast("Gagal menyimpan rekaman: " + e.message, true); }
}

$("#btnRekam").onclick = () => (M.rek ? selesaiRekam() : mulaiRekam());
$("#btnStop").onclick = () => { if (M.rek) selesaiRekam(); else if (Pm.main) hentikanPutar(); };

// ================= Daftar rekaman =================
const R = { daftar: [], nama: null, asli: null, rate: 48000, studio: null, analisa: null, awal: 0, akhir: 1, lihat: "asli", versi: 0 };

async function muatDaftar() {
  try { R.daftar = await apiJson("rekaman"); } catch { R.daftar = []; }
  $("#jumlah").textContent = R.daftar.length ? R.daftar.length + " file" : "";
  const hariIni = new Date().toDateString();
  $("#daftar").innerHTML = R.daftar.length ? R.daftar.map((r) => {
    const t = new Date(r.waktu), studio = /\(Studio\)/i.test(r.nama);
    const kapan = t.toDateString() === hariIni ? "Hari ini " + t.toTimeString().slice(0, 5) : t.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    return '<div class="item' + (r.nama === R.nama ? " on" : "") + '" data-n="' + esc(r.nama) + '"><div class="ic"><i class="bi ' + (studio ? "bi-stars" : "bi-play-fill") + '"></i></div>' +
      "<div><b>" + esc(r.nama) + "</b><span>" + kapan + " · " + (studio ? "Studio" : "Asli") + '</span></div><div class="r">' + waktu(r.durasi) + "</div></div>";
  }).join("") : '<div class="info">Belum ada rekaman. Tekan tombol merah untuk mulai merekam.</div>';
  $$("#daftar .item").forEach((el) => (el.onclick = () => bukaRekaman(el.dataset.n)));
}

async function bukaRekaman(nama) {
  if (M.rek) return;
  if (Pm.main) hentikanPutar();
  try {
    const buf = await (await api("rekaman/file?" + q({ nama }))).arrayBuffer();
    let w = dsp.bacaWav(buf);
    if (!w) { const ac = new OfflineAudioContext(1, 1, 48000); const ab = await ac.decodeAudioData(buf); w = { data: dsp.keMono(ab), rate: ab.sampleRate }; }
    tampilkanRekaman(nama, w.data, w.rate);
  } catch (e) { toast("Rekaman tidak bisa dibuka: " + e.message, true); }
}

function tampilkanRekaman(nama, data, rate) {
  Object.assign(R, { nama, asli: data, rate, studio: null, awal: 0, akhir: 1, versi: R.versi + 1 });
  $("#namaRekaman").textContent = nama;
  $$("#daftar .item").forEach((el) => el.classList.toggle("on", el.dataset.n === nama));
  Pm.posisi = 0;
  setLihat("asli");
  R.analisa = dsp.analisa(data, rate);
  tampilkanAnalisa();
  $("#claudeSay").innerHTML = '<i class="bi bi-info-circle"></i> Tekan "Rapikan sekarang" supaya efek dipilih otomatis untuk rekaman ini.';
  $("#claudeSay").classList.remove("galat");
  prosesUlang();
  aturTombol();
}

$("#btnGanti").onclick = async () => {
  if (!R.nama) return;
  const baru = await dialog({ judul: "Ganti nama rekaman", input: R.nama, ok: "Ganti" });
  if (!baru || baru.trim() === R.nama) return;
  try { const j = await apiJson("rekaman/ganti-nama?" + q({ lama: R.nama, baru: baru.trim() }), { method: "POST" }); R.nama = j.nama; $("#namaRekaman").textContent = j.nama; await muatDaftar(); toast("Nama diganti"); }
  catch (e) { toast(e.message, true); }
};
$("#btnHapus").onclick = async () => {
  if (!R.nama) return;
  const ya = await dialog({ judul: "Hapus rekaman?", teks: "\"" + R.nama + "\" dipindah ke Recycle Bin. Masih bisa dikembalikan dari sana.", ok: "Hapus", bahaya: true });
  if (!ya) return;
  try {
    if (Pm.main) hentikanPutar();
    await api("rekaman/hapus?" + q({ nama: R.nama }), { method: "POST" });
    Object.assign(R, { nama: null, asli: null, studio: null, analisa: null });
    $("#namaRekaman").textContent = "Belum ada rekaman dipilih";
    gambarGelombang(); tampilkanAnalisa(); aturTombol(); await muatDaftar(); toast("Dipindah ke Recycle Bin");
  } catch (e) { toast(e.message, true); }
};
$("#btnFolder").onclick = () => api("folder" + (R.nama ? "?" + q({ nama: R.nama }) : ""), { method: "POST" }).catch((e) => toast(e.message, true));

// ================= Gelombang, potong, dan posisi =================
const kanvas = $("#wave"), wadah = $("#gelombang");
const dataTampil = () => (R.lihat === "studio" ? R.studio : R.asli);

function gambarGelombang() {
  const r = window.devicePixelRatio || 1, w = kanvas.clientWidth, h = kanvas.clientHeight;
  kanvas.width = w * r; kanvas.height = h * r;
  const g = kanvas.getContext("2d"); g.scale(r, r); g.clearRect(0, 0, w, h);
  const x = dataTampil();
  $("#waveKosong").hidden = !!x;
  $("#waveKosong").textContent = R.asli && !x ? "Hasil studio sedang diproses…" : "Rekam atau pilih rekaman untuk melihat gelombang suara";
  const studioView = R.lihat === "studio";
  ["#hL", "#hR", "#trimL", "#trimR"].forEach((s) => ($(s).hidden = !x || studioView));
  if (!x) { $("#penggaris").innerHTML = ""; return; }
  const css = getComputedStyle(html), p = css.getPropertyValue("--p").trim(), p2 = css.getPropertyValue("--p2").trim();
  const grad = g.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, p); grad.addColorStop(1, p2);
  const kolom = Math.max(1, Math.floor(w / 3)), posisi = (Pm.main ? Pm.posisiKini : Pm.posisi) / (x.length / R.rate);
  // Puncak per kolom disimpan supaya menggambar ulang (saat memutar) tetap ringan
  if (!cachePuncak || cachePuncak.data !== x || cachePuncak.kolom !== kolom) {
    const per = x.length / kolom, pk = new Float32Array(kolom);
    for (let c = 0; c < kolom; c++) {
      let mx = 0; const a = Math.floor(c * per), b = Math.min(x.length, Math.floor((c + 1) * per));
      for (let i = a; i < b; i += 2) { const v = Math.abs(x[i]); if (v > mx) mx = v; }
      pk[c] = mx;
    }
    cachePuncak = { data: x, kolom, pk };
  }
  for (let c = 0; c < kolom; c++) {
    const mx = cachePuncak.pk[c];
    const bh = Math.max(2, Math.min(1, mx * 1.15) * (h - 12));
    const fr = c / kolom, diPotong = !studioView && (fr < R.awal || fr > R.akhir);
    // Bagian yang sudah diputar terang, sisanya lebih redup, bagian yang dipotong paling redup
    g.globalAlpha = diPotong ? 0.18 : fr < posisi ? 1 : 0.5;
    g.fillStyle = mx >= 0.99 ? "#ff4d5e" : grad;
    g.fillRect(c * 3, (h - bh) / 2, 2, bh);
  }
  g.globalAlpha = 1;
  g.fillStyle = "#fbbf24"; g.fillRect(Math.round(w * Math.min(1, posisi)), 0, 2, h);
  // pegangan potong
  if (!studioView) {
    $("#hL").style.left = R.awal * 100 + "%"; $("#hR").style.left = R.akhir * 100 + "%";
    $("#trimL").style.width = R.awal * 100 + "%"; $("#trimR").style.width = (1 - R.akhir) * 100 + "%";
  }
  const dur = x.length / R.rate;
  $("#penggaris").innerHTML = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => "<span>" + waktu(dur * f) + "</span>").join("");
}
let cachePuncak = null;
new ResizeObserver(() => gambarGelombang()).observe(wadah);

// Seret pegangan potong
function seret(pegangan, ke) {
  pegangan.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); pegangan.setPointerCapture(e.pointerId);
    const gerak = (ev) => {
      const kotak = wadah.getBoundingClientRect(), f = Math.max(0, Math.min(1, (ev.clientX - kotak.left) / kotak.width));
      if (ke === "awal") R.awal = Math.min(f, R.akhir - 0.02); else R.akhir = Math.max(f, R.awal + 0.02);
      gambarGelombang();
    };
    const lepas = () => { pegangan.removeEventListener("pointermove", gerak); pegangan.removeEventListener("pointerup", lepas); prosesUlang(); };
    pegangan.addEventListener("pointermove", gerak); pegangan.addEventListener("pointerup", lepas);
  });
}
seret($("#hL"), "awal"); seret($("#hR"), "akhir");

// Klik gelombang = pindah posisi putar
wadah.addEventListener("click", (e) => {
  const x = dataTampil(); if (!x) return;
  const kotak = wadah.getBoundingClientRect(), f = (e.clientX - kotak.left) / kotak.width;
  Pm.posisi = f * x.length / R.rate;
  if (Pm.main) { hentikanPutar(false); putar(); } else gambarGelombang();
});

// Asli / Hasil studio
function setLihat(v) {
  R.lihat = v; $$("#ab button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  if (Pm.main) hentikanPutar();
  Pm.posisi = 0; gambarGelombang();
}
$$("#ab button").forEach((b) => (b.onclick = () => setLihat(b.dataset.v)));

// ================= Memutar rekaman =================
const Pm = { ctx: null, src: null, main: false, posisi: 0, mulaiCtx: 0, mulaiPos: 0, sink: null };
Object.defineProperty(Pm, "posisiKini", { get() { return Pm.main ? Pm.mulaiPos + (Pm.ctx.currentTime - Pm.mulaiCtx) : Pm.posisi; } });

async function putar() {
  const x = dataTampil();
  if (!x) { if (R.asli && R.lihat === "studio") toast("Hasil studio masih diproses, tunggu sebentar."); return; }
  if (M.rek) return;
  if (!Pm.ctx) Pm.ctx = new AudioContext();
  const sink = $("#pilihOutput").value === "default" ? "" : $("#pilihOutput").value;
  if (Pm.ctx.setSinkId && Pm.sink !== sink) { try { await Pm.ctx.setSinkId(sink); Pm.sink = sink; } catch {} }
  await Pm.ctx.resume();
  const b = Pm.ctx.createBuffer(1, x.length, R.rate); b.copyToChannel(x, 0);
  const dur = x.length / R.rate; if (Pm.posisi >= dur - 0.05) Pm.posisi = 0;
  Pm.src = Pm.ctx.createBufferSource(); Pm.src.buffer = b; Pm.src.connect(Pm.ctx.destination);
  Pm.src.onended = () => { if (Pm.main) { Pm.main = false; Pm.posisi = 0; aturTombol(); gambarGelombang(); } };
  Pm.mulaiCtx = Pm.ctx.currentTime; Pm.mulaiPos = Pm.posisi; Pm.src.start(0, Pm.posisi); Pm.main = true;
  aturTombol();
}
function hentikanPutar(simpanPosisi = true) {
  if (!Pm.main) return;
  const pos = Pm.posisiKini; Pm.main = false;
  try { Pm.src.onended = null; Pm.src.stop(); } catch {}
  Pm.posisi = simpanPosisi ? pos : 0; aturTombol(); gambarGelombang();
}
// Garis posisi bergerak selama diputar
setInterval(() => { if (Pm.main) gambarGelombang(); }, 80);

$("#btnPutar").onclick = () => (Pm.main ? hentikanPutar() : putar());
$("#btnDengar").onclick = () => { if (!R.asli) { toast("Pilih rekaman dulu.", true); return; } setLihat("studio"); putar(); };

function aturTombol() {
  const ada = !!R.asli;
  $("#btnRekam").disabled = false;
  $("#btnPutar").disabled = M.rek || !ada;
  $("#btnPutar").querySelector("i").className = "bi " + (Pm.main ? "bi-pause-fill" : "bi-play-fill");
  $("#btnStop").disabled = !M.rek && !Pm.main;
  ["#btnGanti", "#btnHapus", "#btnDengar", "#btnSimpanStudio"].forEach((s) => ($(s).disabled = !ada || M.rek));
  $("#pilihInput").disabled = M.rek;
}

// ================= Studio (efek) =================
const KUNCI_FX = ["desis", "penyeimbang", "eq", "desisS", "gema", "keraskan"];
function tampilkanEfek() {
  const e = P.efek;
  for (const k of KUNCI_FX) {
    const el = $('.fx[data-fx="' + k + '"]'), aktif = !!e[k + "Aktif"];
    el.querySelector(".sw").classList.toggle("off", !aktif); el.classList.toggle("mati", !aktif);
    const r = el.querySelector('input[type=range]'); if (r && e[k] != null) { r.value = e[k]; isiSlider(r); }
  }
  const rn = $('.fx[data-fx="nada"] input'); rn.value = e.nada || 0; isiSlider(rn);
  $("#nadaNilai").textContent = (e.nada > 0 ? "+" : "") + (e.nada || 0);
  $$("#preset button").forEach((b) => b.classList.toggle("on", b.dataset.p === P.preset));
}
function efekBerubah() { P.preset = ""; $$("#preset button").forEach((b) => b.classList.remove("on")); simpanPengaturan(); prosesUlang(); }
for (const k of KUNCI_FX) {
  const el = $('.fx[data-fx="' + k + '"]');
  el.querySelector(".sw").onclick = () => { P.efek[k + "Aktif"] = !P.efek[k + "Aktif"]; tampilkanEfek(); efekBerubah(); };
  const r = el.querySelector('input[type=range]');
  if (r) r.addEventListener("input", () => { P.efek[k] = +r.value; if (!P.efek[k + "Aktif"]) { P.efek[k + "Aktif"] = true; tampilkanEfek(); } efekBerubah(); });
}
$('.fx[data-fx="nada"] input').addEventListener("input", (e) => { P.efek.nada = +e.target.value; $("#nadaNilai").textContent = (P.efek.nada > 0 ? "+" : "") + P.efek.nada; efekBerubah(); });
$$("#preset button").forEach((b) => (b.onclick = () => {
  P.efek = { ...dsp.PRESET[b.dataset.p], nada: P.efek.nada || 0 }; P.preset = b.dataset.p;
  tampilkanEfek(); simpanPengaturan(); prosesUlang();
}));

const prosesUlang = tundaan(async () => {
  if (!R.asli) return;
  const versi = ++R.versi;
  R.studio = null; if (R.lihat === "studio") { if (Pm.main) hentikanPutar(); gambarGelombang(); }
  $("#btnDengar").querySelector("span").textContent = "Memproses…";
  try {
    const hasil = await dsp.prosesStudio(R.asli, R.rate, P.efek, R.awal, R.akhir);
    if (versi !== R.versi) return; // sudah ada perubahan yang lebih baru
    R.studio = hasil;
    if (R.lihat === "studio") gambarGelombang();
  } catch (e) { toast("Efek gagal diproses: " + e.message, true); }
  finally { if (versi === R.versi) $("#btnDengar").querySelector("span").textContent = "Dengar hasil"; }
}, 350);

$("#btnSimpanStudio").onclick = async () => {
  if (!R.asli) return;
  if (!R.studio) { toast("Hasil studio masih diproses, tunggu sebentar."); return; }
  const dasar = R.nama.replace(/\s*\(Studio\)(\s*\(\d+\))?$/i, "");
  try {
    const j = await apiJson("rekaman/simpan?" + q({ nama: dasar + " (Studio)" }), { method: "POST", body: dsp.keWav(R.studio, R.rate) });
    await muatDaftar(); toast("Hasil studio tersimpan: " + j.nama);
  } catch (e) { toast("Gagal menyimpan: " + e.message, true); }
};

// ================= Rapikan dengan Claude =================
function ringkasAnalisa(h) {
  const r = (v) => Math.round(v * 10) / 10;
  return { durasiDetik: r(h.durasi), puncakDb: r(h.puncakDb), rataRataDb: r(h.rataDb), persenSampelPecah: r(h.persenPecah),
    persenBagianSenyap: r(h.persenSenyap), lantaiDerauDb: r(h.lantaiDerauDb), rentangDinamikaDb: r(h.rentangDinamikaDb),
    energiPersen: { getaranDibawah80Hz: r(h.getaran), bass80_300Hz: r(h.bass), badanSuara300_1200Hz: r(h.badan), kejelasan1_2_5kHz: r(h.kejelasan), udaraDiatas5kHz: r(h.udara) },
    catatan: "Mono, musik dan vokal tercampur dari mixer. Rekaman bagus sebelumnya: puncak -2,7 dB, bass 27-36%, kejelasan 18-24%." };
}
function terapkanSetelan(s) {
  P.efek = { desisAktif: s.desisAktif, desis: s.desis, penyeimbangAktif: s.penyeimbangAktif, penyeimbang: s.penyeimbang, eqAktif: s.eqAktif, eq: s.eq,
    desisSAktif: s.desisSAktif, gemaAktif: s.gemaAktif, gema: s.gema, keraskanAktif: s.keraskanAktif, nada: s.nada || 0 };
  P.preset = ""; tampilkanEfek(); simpanPengaturan(); prosesUlang();
}
$("#btnRapikan").onclick = async () => {
  if (!R.asli || !R.analisa || R.analisa.pendek) { toast("Pilih rekaman dulu.", true); return; }
  const tombol = $("#btnRapikan"), say = $("#claudeSay");
  tombol.disabled = true; tombol.querySelector("span").textContent = "Claude sedang menyimak…";
  say.classList.remove("galat");
  try {
    const { kunci } = await apiJson("kunci-claude");
    let s;
    if (!kunci) {
      s = dsp.setelanOtomatis(R.analisa);
      say.innerHTML = '<i class="bi bi-check2-circle"></i> ' + esc(s.pesan) + " <i>(Atur kunci API Claude untuk saran langsung dari Claude.)</i>";
    } else {
      const claude = await import("./vendor/claude.js");
      try { s = await claude.mintaSaranClaude(kunci, ringkasAnalisa(R.analisa)); }
      catch (e) { throw new Error(claude.pesanGalat(e)); }
      say.innerHTML = '<i class="bi bi-check2-circle"></i> "' + esc(s.pesan) + '"';
    }
    terapkanSetelan(s); setLihat("studio");
  } catch (e) {
    say.classList.add("galat"); say.innerHTML = '<i class="bi bi-exclamation-circle"></i> ' + esc(e.message);
  } finally { tombol.disabled = false; tombol.querySelector("span").textContent = "Rapikan sekarang"; }
};
$("#btnKunci").onclick = async () => {
  let ada = false; try { ada = !!(await apiJson("kunci-claude")).kunci; } catch {}
  const k = await dialog({ judul: "Kunci API Claude", sandi: true, input: "", ok: "Simpan",
    teks: (ada ? "Kunci sudah tersimpan. Isi untuk mengganti, atau kosongkan lalu Simpan untuk menghapus. " : "") +
      "Buat kunci di platform.claude.com (menu API keys). Kunci disimpan terenkripsi di laptop ini. Yang dikirim ke Claude hanya angka hasil analisa, bukan suara Anda." });
  if (k === null) return;
  try { await api("kunci-claude", { method: "POST", body: k.trim() }); toast(k.trim() ? "Kunci Claude tersimpan" : "Kunci Claude dihapus"); }
  catch (e) { toast(e.message, true); }
};

// ================= Analisa =================
function tampilkanAnalisa() {
  const h = R.analisa, set = (id, nilai, ket, ok) => { $(id).textContent = nilai; const em = $(id + "Ket"); em.innerHTML = ket ? '<i class="bi ' + (ok ? "bi-check2" : "bi-exclamation") + '"></i>' + esc(ket) : ""; em.style.color = ok ? "" : "var(--warn)"; };
  if (!h || h.pendek) {
    ["#stPecah", "#stSenyap", "#stBass", "#stJelas"].forEach((id) => set(id, "–", "", true));
    $("#bands").innerHTML = ""; $("#tip div").textContent = h ? "Rekaman terlalu pendek untuk dianalisa." : "Pilih rekaman untuk melihat analisa.";
    return;
  }
  const n = dsp.nilaiAnalisa(h);
  set("#stPecah", ...n.kartu.pecah); set("#stSenyap", ...n.kartu.senyap); set("#stBass", ...n.kartu.bass); set("#stJelas", ...n.kartu.jelas);
  const pita = [["Getaran", "<80 Hz", h.getaran, false], ["Bass", "80–300", h.bass, h.bass <= 50], ["Badan", "300–1,2k", h.badan, true], ["Jelas", "1,2–5k", h.kejelasan, h.kejelasan >= 10], ["Udara", ">5k", h.udara, false]];
  $("#bands").innerHTML = pita.map(([nama, ket, v, ok]) => '<div class="band"><strong>' + Math.round(v) + '%</strong><div class="b' + (ok ? " ok" : "") + '" style="height:' + Math.max(3, Math.min(100, v * 1.3)) + '%"></div><small>' + nama + "<br>" + esc(ket) + "</small></div>").join("");
  $("#tip").style.background = n.bagus ? "" : "rgba(251,191,36,.12)"; $("#tip").style.borderColor = n.bagus ? "" : "rgba(251,191,36,.35)";
  $("#tip div").innerHTML = n.saran.map((s, i) => (i === 0 && n.bagus ? "<b>" + esc(s) + "</b>" : "• " + esc(s))).join("<br>");
}

// ================= Mulai =================
(async function mulai() {
  try { Object.assign(P, await apiJson("pengaturan")); P.efek = { ...EFEK_AWAL, ...(P.efek || {}) }; } catch {}
  terapkanTema(); tampilkanEfek(); aturTombol(); tampilkanAnalisa(); gambarGelombang();
  await muatDaftar();
  await isiPerangkat();
  setInterval(() => api("ping").catch(() => {}), 20000); api("ping").catch(() => {});
})();
