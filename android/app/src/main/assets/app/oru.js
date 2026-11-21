// Oru Studio (HP): tampilan + alur rekam. Olah suara memakai mesin yang sama dengan versi laptop (dsp/magic/ekspor).
import * as dsp from "../dsp.js";
import * as magic from "../magic.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const html = document.documentElement;
const Oru = window.Oru || null; // jembatan Android
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (o) => new URLSearchParams(o).toString();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const waktu = (d) => { d = Math.max(0, Math.floor(d || 0)); return String(Math.floor(d / 60)).padStart(2, "0") + ":" + String(d % 60).padStart(2, "0"); };
const tundaan = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const durasiYt = (d) => (d || "").replace(/\./g, ":");

async function api(rute, opsi = {}) {
  const r = await fetch("/api/" + rute, opsi);
  if (!r.ok) { let p = r.statusText; try { p = (await r.json()).galat || p; } catch {} throw new Error(p); }
  return r;
}
async function apiJson(rute, opsi) { const j = await (await api(rute, opsi)).json(); if (j && j.galat) throw new Error(j.galat); return j; }

let toastTimer;
function toast(teks, galat = false) {
  const t = $("#toast"); t.textContent = teks; t.classList.toggle("galat", galat); t.classList.add("tampil");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("tampil"), galat ? 4500 : 3000);
}
function dialog({ judul, teks = "", input = null, ok = "OK", bahaya = false }) {
  return new Promise((selesai) => {
    const l = document.createElement("div"); l.className = "dlg-latar";
    l.innerHTML = '<div class="dlg"><h3></h3>' + (teks ? "<p></p>" : "") + (input !== null ? "<input>" : "") +
      '<div class="aksi-dlg"><button class="btn" data-a="0">Batal</button><button class="btn ' + (bahaya ? "bahaya" : "primary") + '" data-a="1"></button></div></div>';
    l.querySelector("h3").textContent = judul; if (teks) l.querySelector("p").textContent = teks;
    l.querySelector('[data-a="1"]').textContent = ok;
    const inp = l.querySelector("input"); if (inp) inp.value = input;
    const tutup = (v) => { l.remove(); selesai(v); };
    l.querySelector('[data-a="0"]').onclick = () => tutup(null);
    l.querySelector('[data-a="1"]').onclick = () => tutup(inp ? inp.value : true);
    l.addEventListener("click", (e) => { if (e.target === l) tutup(null); });
    document.body.appendChild(l); if (inp) { inp.focus(); inp.select(); }
  });
}
function isiSlider(r) { r.style.setProperty("--v", ((r.value - r.min) / (r.max - r.min)) * 100 + "%"); }

// ================= Pengaturan =================
const P = { warna: "mawar", mode: "glass-dark", keraskanOto: true, autoplay: false, volPutar: 100, mixVokal: 100, mixMusik: 45, efek: { ...dsp.PRESET.pop, nada: 0 }, riwayatCari: [] };
const simpanPengaturan = tundaan(() => api("pengaturan", { method: "POST", body: JSON.stringify(P) }).catch(() => {}), 400);
const WARNA = { mawar: "#f43f5e", ungu: "#8b5cf6", tosca: "#14b8a6", senja: "#f97316" };
function terapkanTema() {
  html.dataset.warna = P.warna; html.dataset.olSkin = P.mode;
  $("#warna").innerHTML = Object.entries(WARNA).map(([k, c]) => '<button data-w="' + k + '" class="' + (k === P.warna ? "on" : "") + '" style="background:' + c + '"></button>').join("");
  $$("#warna button").forEach((b) => (b.onclick = () => { P.warna = b.dataset.w; terapkanTema(); simpanPengaturan(); }));
  $$("#tema button").forEach((b) => b.classList.toggle("on", b.dataset.m === P.mode));
  $("#swKeras").classList.toggle("off", !P.keraskanOto);
  $("#swAuto").classList.toggle("off", !P.autoplay); $("#swAuto2").classList.toggle("off", !P.autoplay);
}
$$("#tema button").forEach((b) => (b.onclick = () => { P.mode = b.dataset.m; terapkanTema(); simpanPengaturan(); }));
$("#swKeras").onclick = () => { P.keraskanOto = !P.keraskanOto; terapkanTema(); simpanPengaturan(); };
$("#swAuto2").onclick = $("#swAutoplay").onclick = () => { P.autoplay = !P.autoplay; terapkanTema(); simpanPengaturan(); };

// ================= Navigasi =================
let halKini = "hKaraoke";
function bukaHal(id) {
  if (M.rek) return;
  halKini = id;
  $$(".hal").forEach((h) => h.classList.toggle("on", h.id === id));
  $$(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.hal === id));
  if (id === "hRekaman") setTimeout(gambarGelombang, 30);
  if (id === "hPengaturan") tampilPengaturan();
}
$$(".nav button").forEach((b) => (b.onclick = () => bukaHal(b.dataset.hal)));
// tombol Kembali Android: tutup lembar/tab dulu sebelum keluar aplikasi
window.tombolKembali = () => {
  if (!$("#mvLatar").hidden) { if (!MV.sibuk) $("#mvLatar").hidden = true; return true; }
  if (document.querySelector(".dlg-latar")) { document.querySelector(".dlg-latar").remove(); return true; }
  if (M.rek) return true;
  if (halKini !== "hKaraoke") { bukaHal("hKaraoke"); return true; }
  if (YT.tampilan === "cari" && YT.kini) { YT.tampilan = "berikutnya"; tampilkanKolom(); return true; }
  return false;
};

// ================= Musik panduan (volume speaker HP) =================
function tampilVolPanduan() {
  const el = $("#volPanduan"); if (!Oru) { $("#volNilai").textContent = "–"; return; }
  el.max = Oru.volumeMaks(); el.value = Oru.volume(); isiSlider(el);
  $("#volNilai").textContent = Math.round((el.value / el.max) * 100) + "%";
  $("#ikonPanduan").className = "bi " + (+el.value === 0 ? "bi-volume-mute-fill" : el.value / el.max < 0.5 ? "bi-volume-down-fill" : "bi-volume-up-fill");
}
$("#volPanduan").addEventListener("input", (e) => { if (Oru) Oru.aturVolume(+e.target.value); tampilVolPanduan(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) tampilVolPanduan(); });
setInterval(() => { if (halKini === "hKaraoke" && document.activeElement !== $("#volPanduan")) tampilVolPanduan(); }, 1500);

// ================= YouTube =================
const YT = { pemutar: null, siap: false, status: -1, kini: null, terkait: [], tampilan: "berikutnya", cari: { kata: "", item: [] } };
window.onYouTubeIframeAPIReady = () => { YT.siap = true; };
(() => { const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.onerror = () => toast("YouTube tidak bisa dimuat. Periksa internet.", true); document.head.appendChild(s); })();
const YTA = new Proxy({}, { get: (_, k) => window.YT[k] });

const kartuVideo = (v, i) =>
  '<div class="vi' + (YT.kini && YT.kini.id === v.id ? " on" : "") + '" data-i="' + i + '"><div class="th" style="background-image:url(https://i.ytimg.com/vi/' + esc(v.id) + '/mqdefault.jpg)">' +
  (v.durasi ? "<small>" + esc(durasiYt(v.durasi)) + "</small>" : "") + '</div><div class="t"><b>' + esc(v.judul) + "</b><span>" + esc(v.channel) + "</span></div></div>";

function tampilkanKolom() {
  const k = $("#kolom");
  const daftar = YT.tampilan === "cari" ? YT.cari.item : YT.terkait;
  $("#judulDaftar").textContent = YT.tampilan === "cari" ? 'Hasil "' + YT.cari.kata + '"' : "Berikutnya";
  $("#swAutoplay").hidden = YT.tampilan === "cari";
  if (daftar === null) { k.innerHTML = '<div class="info">Memuat…</div>'; return; }
  if (!daftar.length) { k.innerHTML = '<div class="info">' + (YT.tampilan === "cari" ? "Tidak ada hasil." : YT.kini ? "Tidak ada saran." : "Cari lagu karaoke di atas, misalnya \"karaoke akustik\".") + "</div>"; return; }
  k.innerHTML = daftar.map(kartuVideo).join("");
  k.querySelectorAll(".vi").forEach((el) => (el.onclick = () => { const v = daftar[+el.dataset.i]; if (YT.tampilan === "cari") YT.tampilan = "berikutnya"; putarVideo(v); }));
  k.scrollTop = 0;
}

$("#cari").addEventListener("submit", async (e) => {
  e.preventDefault();
  const kata = $("#kata").value.trim(); if (!kata) return;
  $("#kata").blur(); $("#riwayatCari").hidden = true;
  if (!/^https?:/i.test(kata)) { P.riwayatCari = [kata, ...(P.riwayatCari || []).filter((x) => x.toLowerCase() !== kata.toLowerCase())].slice(0, 15); simpanPengaturan(); }
  YT.cari = { kata, item: null }; YT.tampilan = "cari"; tampilkanKolom();
  try { YT.cari.item = await apiJson("cari?" + q({ q: kata })); } catch (err) { YT.cari.item = []; toast(err.message, true); }
  if (YT.tampilan === "cari") tampilkanKolom();
  if (YT.cari.item.length === 1 && YT.cari.item[0].judul === "Video dari link") { YT.tampilan = "berikutnya"; putarVideo(YT.cari.item[0]); }
});
function tampilRiwayat() {
  const qk = $("#kata").value.trim().toLowerCase();
  const r = (P.riwayatCari || []).filter((x) => !qk || (x.toLowerCase().includes(qk) && x.toLowerCase() !== qk)).slice(0, 6);
  $("#hapusKata").hidden = !$("#kata").value;
  const k = $("#riwayatCari");
  if (!r.length || document.activeElement !== $("#kata")) { k.hidden = true; return; }
  k.innerHTML = r.map((x) => '<div class="r" data-k="' + esc(x) + '"><i class="bi bi-clock-history"></i><span>' + esc(x) + "</span></div>").join("");
  k.hidden = false;
}
$("#kata").addEventListener("focus", tampilRiwayat);
$("#kata").addEventListener("input", tampilRiwayat);
$("#kata").addEventListener("blur", () => setTimeout(() => ($("#riwayatCari").hidden = true), 150));
$("#riwayatCari").addEventListener("pointerdown", (e) => { const r = e.target.closest("[data-k]"); if (!r) return; e.preventDefault(); $("#kata").value = r.dataset.k; $("#cari").requestSubmit(); });
$("#hapusKata").onclick = () => { $("#kata").value = ""; $("#hapusKata").hidden = true; $("#kata").focus(); };

/** Pilih lagu: video disiapkan (belum diputar). Diputar bersamaan saat tombol rekam ditekan, atau ketuk layar video untuk dengar saja. */
async function putarVideo(v, langsung = false) {
  if (!v) return;
  if (!YT.siap) { toast("YouTube belum siap, coba lagi sebentar.", true); return; }
  YT.kini = { ...v }; YT.terkait = null;
  $("#ytKosong").hidden = true; $("#kini").hidden = false;
  tampilkanKini();
  if (!YT.pemutar) {
    YT.pemutar = new YTA.Player("ytPlayer", {
      videoId: v.id, playerVars: { autoplay: langsung ? 1 : 0, rel: 0, playsinline: 1, modestbranding: 1, origin: location.origin },
      events: {
        onReady: () => { if (langsung || M.rek) YT.pemutar.playVideo(); },
        onStateChange: (e) => { YT.status = e.data; tampilTombolYt(); if (e.data === 0) laguSelesai(); },
        onError: (e) => { if ([100, 101, 150, 152, 153].includes(e.data)) { toast("Video ini tidak boleh diputar di luar YouTube. Pilih video lain.", true); } },
      },
    });
  } else if (langsung) YT.pemutar.loadVideoById(v.id); else YT.pemutar.cueVideoById(v.id);
  $("#ytSiap").hidden = langsung || M.rek;
  tampilkanKolom(); tampilRekam();
  try {
    const j = await apiJson("terkait?" + q({ id: v.id }));
    if (YT.kini.id !== v.id) return;
    YT.terkait = j.video;
    if (j.judul && (!YT.kini.judul || YT.kini.judul === "Video dari link")) YT.kini.judul = j.judul;
    if (j.channel) YT.kini.channel = j.channel;
    tampilkanKini();
  } catch { YT.terkait = []; }
  if (YT.tampilan === "berikutnya") tampilkanKolom();
}
function tampilkanKini() { const v = YT.kini; if (!v) return; $("#ytJudul").textContent = v.judul; $("#ytChannel").textContent = v.channel || ""; }
function tampilTombolYt() {
  const main = YT.status === 1 || YT.status === 3;
  $("#ytPlay i").className = "bi " + (main ? "bi-pause-fill" : "bi-play-fill");
  if (main) $("#ytSiap").hidden = true;
}
$("#ytPlay").onclick = () => { if (!YT.pemutar) return; if (YT.status === 1 || YT.status === 3) YT.pemutar.pauseVideo(); else { $("#ytSiap").hidden = true; YT.pemutar.playVideo(); } };
$("#ytSiap").onclick = () => { $("#ytSiap").hidden = true; if (YT.pemutar) YT.pemutar.playVideo(); };
$("#ytNext").onclick = () => { if (M.rek) return; if (YT.terkait && YT.terkait.length) putarVideo(YT.terkait[0], true); };
function laguSelesai() {
  if (M.rek) { toast("Lagu selesai, rekaman disimpan."); selesaiRekam(); return; }
  if (P.autoplay && YT.terkait && YT.terkait.length) putarVideo(YT.terkait[0], true);
}

// ================= Rekam =================
const M = { rek: false, mulai: false, judul: "", polling: null, adaMusik: false, iklanTerakhir: false };
window.dariAndroid = (jenis, pesan) => {
  if (jenis === "rekamTanpaMusik") toast("Tanpa izin rekam suara HP: musik hanya terekam lewat mic.", true);
  else if (jenis === "rekamGagal") { toast(pesan, true); M.mulai = false; tampilRekam(); }
  else if (jenis === "rekamMulai") tungguMulai();
};
async function mulaiRekam() {
  if (!Oru) { toast("Rekam hanya bisa di aplikasi Android.", true); return; }
  if (M.rek || M.mulai) return;
  if (Pm.main) hentikanPutar();
  M.mulai = true; M.judul = YT.kini ? YT.kini.judul : ""; tampilRekam();
  Oru.mulaiRekam(); // Android menanyakan izin rekam suara HP, lalu memanggil dariAndroid("rekamMulai")
  setTimeout(() => { if (M.mulai && !M.rek) { M.mulai = false; tampilRekam(); } }, 60000);
}
async function tungguMulai() {
  for (let i = 0; i < 50; i++) {
    const s = JSON.parse(Oru.status());
    if (s.aktif) {
      M.rek = true; M.mulai = false; M.adaMusik = s.adaMusik;
      document.body.classList.add("merekam"); Oru.layarNyala(true);
      $("#ytSiap").hidden = true;
      if (YT.pemutar && YT.kini) { try { if (YT.status !== 1) YT.pemutar.playVideo(); } catch {} }
      tampilRekam(); pantau();
      return;
    }
    if (s.galat) { toast(s.galat, true); break; }
    await tunggu(100);
  }
  M.mulai = false; tampilRekam();
}
function pantau() {
  clearInterval(M.polling);
  M.polling = setInterval(() => {
    const s = JSON.parse(Oru.status());
    if (!s.aktif && !s.menyimpan) return;
    $("#waktuRek").textContent = waktu(s.detik);
    const lebar = (db) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) + "%";
    $("#lvMic").style.width = lebar(s.mic); $("#lvMusik").style.width = s.adaMusik ? lebar(s.musik) : "0%";
    if (s.iklan !== M.iklanTerakhir) {
      M.iklanTerakhir = s.iklan; $("#catatanIklan").classList.toggle("tahan", s.iklan);
      $("#ketIklan").textContent = s.iklan ? "Iklan muncul: rekaman ditahan, lanjut sendiri sesudah iklan." : "Iklan YouTube diblokir. Kalau ada yang lolos, rekaman berhenti sebentar dan lanjut sendiri.";
    }
  }, 120);
}
function namaRekamanBaru() {
  const j = (M.judul || "").replace(/[\[(（【][^\])）】]*(karaoke|lirik|lyrics?|instrumental|official|version|versi|hq|audio|key|nada)[^\])）】]*[\])）】]/gi, "")
    .replace(/\b(karaoke|lirik|lyrics?|instrumental)\b/gi, "").replace(/[|•·]+.*$/, "").replace(/\s*[-–—]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  const d = new Date(), p = (n) => String(n).padStart(2, "0"), jam = p(d.getHours()) + "." + p(d.getMinutes());
  return j ? (j.length > 70 ? j.slice(0, 70).trim() : j) + " " + jam : "Rekaman " + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + jam;
}
async function selesaiRekam() {
  if (!M.rek) return;
  M.rek = false; clearInterval(M.polling);
  if (YT.pemutar && (YT.status === 1 || YT.status === 3)) { try { YT.pemutar.pauseVideo(); } catch {} }
  $("#btnRekam").disabled = true; $("#ketRek").textContent = "Menyimpan…";
  Oru.stopRekam(namaRekamanBaru());
  let s = null;
  for (let i = 0; i < 300; i++) { await tunggu(100); s = JSON.parse(Oru.status()); if (!s.aktif && !s.menyimpan) break; }
  document.body.classList.remove("merekam"); Oru.layarNyala(false);
  $("#btnRekam").disabled = false; tampilRekam();
  if (!s || !s.nama) { toast(s && s.galat ? s.galat : "Rekaman gagal disimpan.", true); return; }
  const nama = s.nama;
  try {
    let buf = await (await api("rekaman/file?" + q({ nama }))).arrayBuffer();
    let w = dsp.bacaWav(buf);
    if (!w || w.data.length < w.rate * 0.5) { await api("rekaman/hapus?" + q({ nama }), { method: "POST" }); toast("Rekaman terlalu pendek.", true); return; }
    let data = w.data;
    if (P.keraskanOto) { data = dsp.keraskanRekaman(data, w.rate); await apiJson("rekaman/simpan?" + q({ nama, timpa: 1 }), { method: "POST", body: dsp.keWav(data, w.rate) }); }
    // jenis: 2 jalur (musik digital) | vokal saja | campur (musik ikut terekam lewat mic)
    await simpanMeta(nama, { jenis: s.adaMusik ? "rekam" : YT.kini ? "campur" : "vokal" });
    toast("Tersimpan: " + nama);
    await muatDaftar();
    bukaHal("hRekaman");
    tampilkanRekaman(nama, data, w.rate);
  } catch (e) { toast("Gagal memproses: " + e.message, true); }
}
function tampilRekam() {
  const b = $("#btnRekam");
  b.innerHTML = M.rek ? '<span class="kotak"></span>' : '<i class="bi bi-mic-fill"></i>';
  $("#titikRek").hidden = !M.rek;
  $("#pilRek").hidden = M.rek; $("#kapsulRek").hidden = !M.rek;
  $("#catatanIklan").hidden = !M.rek;
  if (!M.rek) $("#waktuRek").textContent = "00:00";
  $("#ketRek").textContent = M.rek ? (M.adaMusik ? "Merekam · vokal + musik digital" : "Merekam · vokal") : M.mulai ? "Menunggu izin…" : YT.kini ? "Tekan untuk merekam bersama lagu" : "Tekan untuk mulai merekam";
  $("#subKaraoke").textContent = M.rek ? "Merekam…" : "Karaoke & rekam";
}
$("#btnRekam").onclick = () => (M.rek ? selesaiRekam() : mulaiRekam());

// ================= Daftar rekaman =================
const R = { daftar: [], nama: null, asli: null, rate: 48000, studio: null, analisa: null, awal: 0, akhir: 1, lihat: "asli", versi: 0, meta: {} };
async function muatDaftar() {
  try { R.daftar = await apiJson("rekaman"); } catch { R.daftar = []; }
  $("#subRekaman").textContent = R.daftar.length + " rekaman · Music/Oru Studio";
  const hariIni = new Date().toDateString();
  $("#daftar").innerHTML = R.daftar.length ? R.daftar.map((r) => {
    const w = new Date(r.waktu), studio = /\((Studio|Magic Vocal)\)/i.test(r.nama);
    const kapan = w.toDateString() === hariIni ? "Hari ini " + w.toTimeString().slice(0, 5) : w.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    return '<div class="rk' + (r.nama === R.nama ? " on" : "") + '" data-n="' + esc(r.nama) + '"><button class="ic" data-putar><i class="bi bi-play-fill"></i></button><div class="tx"><b>' + esc(r.nama) + "</b><span>" +
      kapan + " · " + (studio ? "Studio" : r.musik ? "2 jalur" : "Asli") + '</span></div><span class="d">' + waktu(r.durasi) + "</span></div>";
  }).join("") : '<div class="info">Belum ada rekaman.</div>';
  $$("#daftar .rk").forEach((el) => (el.onclick = async (e) => {
    const n = el.dataset.n;
    if (e.target.closest("[data-putar]")) { if (R.nama === n && R.asli) { Pm.main ? hentikanPutar() : putar(); return; } await bukaRekaman(n); if (R.nama === n) putar(); return; }
    bukaRekaman(n); $("#hRekaman .isi").scrollTo({ top: 0, behavior: "smooth" });
  }));
  aturTombol();
}
async function bukaRekaman(nama) {
  if (Pm.main) hentikanPutar();
  try {
    const buf = await (await api("rekaman/file?" + q({ nama }))).arrayBuffer();
    let w = dsp.bacaWav(buf);
    if (!w) { const ac = new OfflineAudioContext(1, 1, 48000); const ab = await ac.decodeAudioData(buf); w = { data: dsp.keMono(ab), rate: ab.sampleRate }; }
    tampilkanRekaman(nama, w.kanal ? dsp.keMonoDari(w.kanal) : w.data, w.rate);
  } catch (e) { toast(e.message, true); }
}
function tampilkanRekaman(nama, data, rate) {
  Object.assign(R, { nama, asli: data, rate, studio: null, studioSt: null, awal: 0, akhir: 1, versi: R.versi + 1, pita: null, gaya: 2, musik: null, musikSt: null, geser: 0, asliMix: null, asliMixSt: null, meta: {}, magicAktif: false, vokalMagic: null, mixAuto: false });
  MV.untuk = null; MV.ren = null;
  $("#editor").hidden = false; $("#belumPilih").hidden = true;
  $("#mvStatus").hidden = true; $("#kartuNada").hidden = true; $("#gayaRapikan").hidden = true;
  $("#judulRek").textContent = nama;
  $$("#daftar .rk").forEach((el) => el.classList.toggle("on", el.dataset.n === nama));
  Pm.posisi = 0; setLihat("asli");
  R.analisa = dsp.analisa(data, rate);
  R.levelInfo = dsp.ringkasLevel(data, rate); tampilRingkasLevel();
  tampilMix(); prosesUlang(); aturTombol();
  muatJalurMusik(nama);
}
async function muatMeta(nama) { try { R.meta = await apiJson("rekaman/meta?" + q({ nama })); } catch { R.meta = {}; } return R.meta; }
function simpanMeta(nama = R.nama, meta = R.meta) { if (!nama || !meta) return Promise.resolve(); return api("rekaman/meta?" + q({ nama }), { method: "POST", body: JSON.stringify(meta) }).catch(() => {}); }
async function muatJalurMusik(nama) {
  await muatMeta(nama);
  const info = R.daftar.find((r) => r.nama === nama);
  if (!info || !info.musik || R.nama !== nama) { tampilMix(); return; }
  try {
    const buf = await (await api("rekaman/musik?" + q({ nama }))).arrayBuffer();
    const w = dsp.bacaWav(buf); if (!w || R.nama !== nama) return;
    R.musik = dsp.ubahRate(w.data, w.rate, R.rate);
    R.musikSt = w.kanal ? w.kanal.map((k) => dsp.ubahRate(k, w.rate, R.rate)) : null;
    // HP: jeda speaker → mic diukur dari rekaman itu sendiri (sekitar 260 ms di Poco X6 Pro)
    const auto = dsp.cariGeser(R.asli, R.musik, R.rate);
    R.geser = auto != null ? auto : 260;
    const simpan = R.meta && R.meta.mix;
    if (simpan) { P.mixVokal = simpan.v; P.mixMusik = simpan.m; if (simpan.g != null) R.geser = simpan.g; R.mixAuto = false; }
    else { P.mixVokal = 100; R.mixAuto = true; }
    R.asliMix = null; R.asliMixSt = null; tampilMix(); prosesUlang();
  } catch {}
}
function tampilRingkasLevel() {
  const el = $("#ringkasLevel"), L = R.levelInfo;
  if (!L) { el.hidden = true; return; }
  let kelas = "ok", teks;
  if (L.bahaya >= 3) { kelas = "bahaya"; teks = "Hampir pecah " + L.bahaya + "×"; }
  else if (L.pelan > 40) { kelas = "pelan"; teks = "Suara terlalu pelan"; }
  else if (L.ideal >= 70) teks = L.ideal + "% level ideal";
  else { kelas = "pelan"; teks = L.ideal + "% level ideal"; }
  el.className = "ringkas-level " + kelas;
  el.innerHTML = '<i class="bi ' + (kelas === "ok" ? "bi-check-circle-fill" : "bi-exclamation-circle-fill") + '"></i>' + esc(teks);
  el.hidden = R.lihat === "studio";
}

// ================= Mix =================
function tampilMix() {
  const dua = !!R.musik; $("#barisMix").hidden = !dua; if (!dua) return;
  const set = (id, v, teks) => { const el = $(id); el.value = v; isiSlider(el); $(id + "Nilai").textContent = teks; };
  set("#mixVokal", P.mixVokal, P.mixVokal + "%"); set("#mixMusik", P.mixMusik, P.mixMusik + "%");
  const s = $("#mixSinkron"); s.value = Math.round(R.geser || 0); isiSlider(s); $("#sinkronNilai").textContent = Math.round(R.geser || 0) + "ms";
}
function simpanMix() { if (!R.nama || !R.musik) return; R.meta = R.meta || {}; R.meta.mix = { v: P.mixVokal, m: P.mixMusik, g: R.geser }; simpanMeta(); }
const mixBerubah = tundaan(() => { R.asliMix = null; R.asliMixSt = null; simpanMix(); simpanPengaturan(); prosesUlang(); }, 250);
$("#mixVokal").addEventListener("input", (e) => { P.mixVokal = +e.target.value; tampilMix(); mixBerubah(); });
$("#mixMusik").addEventListener("input", (e) => { P.mixMusik = +e.target.value; tampilMix(); mixBerubah(); });
$("#mixSinkron").addEventListener("input", (e) => { R.geser = +e.target.value; tampilMix(); mixBerubah(); });

$("#btnGanti").onclick = async () => {
  if (!R.nama) return;
  const baru = await dialog({ judul: "Ganti nama", input: R.nama, ok: "Ganti" });
  if (!baru || baru.trim() === R.nama) return;
  try { const j = await apiJson("rekaman/ganti-nama?" + q({ lama: R.nama, baru: baru.trim() }), { method: "POST" }); R.nama = j.nama; $("#judulRek").textContent = j.nama; await muatDaftar(); toast("Nama diganti."); }
  catch (e) { toast(e.message, true); }
};
$("#btnHapus").onclick = async () => {
  if (!R.nama) return;
  if (!(await dialog({ judul: "Hapus rekaman?", teks: "\"" + R.nama + "\" dan jalur musiknya akan dihapus dari HP.", ok: "Hapus", bahaya: true }))) return;
  try {
    if (Pm.main) hentikanPutar();
    await api("rekaman/hapus?" + q({ nama: R.nama }), { method: "POST" });
    Object.assign(R, { nama: null, asli: null, studio: null, analisa: null, musik: null });
    $("#editor").hidden = true; $("#belumPilih").hidden = false;
    await muatDaftar(); toast("Rekaman dihapus.");
  } catch (e) { toast(e.message, true); }
};

// ================= Gelombang, potong, posisi =================
const kanvas = $("#wave"), wadah = $("#gelombang");
const AMBANG = { bahaya: Math.pow(10, -3 / 20), atas: Math.pow(10, -6 / 20), bawah: Math.pow(10, -18 / 20) };
const dataTampil = () => (R.lihat === "studio" ? R.studio : R.asli);
let cachePuncak = null;
function gambarGelombang() {
  if (halKini !== "hRekaman" || $("#editor").hidden) return;
  const r = window.devicePixelRatio || 1, w = kanvas.clientWidth, h = kanvas.clientHeight;
  if (!w) return;
  kanvas.width = w * r; kanvas.height = h * r;
  const g = kanvas.getContext("2d"); g.scale(r, r); g.clearRect(0, 0, w, h);
  const x = dataTampil(), studioView = R.lihat === "studio";
  $("#waveKosong").hidden = !!x || !R.asli;
  ["#hL", "#hR", "#trimL", "#trimR"].forEach((s) => ($(s).hidden = !x || studioView));
  if (!x) return;
  const css = getComputedStyle(html), grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, css.getPropertyValue("--p").trim()); grad.addColorStop(1, css.getPropertyValue("--p2").trim());
  const kolom = Math.max(1, Math.floor(w / 3)), dur = x.length / R.rate, posisi = Pm.posisiKini / dur;
  if (!cachePuncak || cachePuncak.data !== x || cachePuncak.kolom !== kolom) {
    const per = x.length / kolom, pk = new Float32Array(kolom);
    for (let c = 0; c < kolom; c++) { let mx = 0; const a = Math.floor(c * per), b = Math.min(x.length, Math.floor((c + 1) * per)); for (let i = a; i < b; i += 4) { const v = Math.abs(x[i]); if (v > mx) mx = v; } pk[c] = mx; }
    cachePuncak = { data: x, kolom, pk };
  }
  for (let c = 0; c < kolom; c++) {
    const mx = cachePuncak.pk[c], bh = Math.max(2, Math.min(1, mx * 1.15) * (h - 12));
    const fr = c / kolom, diPotong = !studioView && (fr < R.awal || fr > R.akhir);
    g.globalAlpha = diPotong ? 0.18 : fr < posisi ? 1 : 0.5;
    g.fillStyle = mx >= (studioView ? 0.99 : AMBANG.bahaya) ? "#ff4d5e" : grad; g.fillRect(c * 3, (h - bh) / 2, 2, bh);
  }
  if (!studioView) {
    const tinggi = (amp) => Math.min(1, amp * 1.15) * (h - 12) / 2;
    [[AMBANG.bahaya, "rgba(255,77,94,.8)"], [AMBANG.atas, "rgba(52,211,153,.7)"], [AMBANG.bawah, "rgba(52,211,153,.45)"]].forEach(([amp, warna]) => {
      const dy = tinggi(amp); g.globalAlpha = 1; g.strokeStyle = warna; g.lineWidth = 1; g.setLineDash([5, 4]);
      for (const y of [h / 2 - dy, h / 2 + dy]) { g.beginPath(); g.moveTo(0, Math.round(y) + .5); g.lineTo(w, Math.round(y) + .5); g.stroke(); }
      g.setLineDash([]);
    });
    $("#hL").style.left = R.awal * 100 + "%"; $("#hR").style.left = R.akhir * 100 + "%";
    $("#trimL").style.width = R.awal * 100 + "%"; $("#trimR").style.width = (1 - R.akhir) * 100 + "%";
  }
  g.globalAlpha = 1; g.fillStyle = "#fbbf24"; g.fillRect(Math.round(w * Math.min(1, posisi)), 0, 2, h);
  $("#ringkasLevel").hidden = studioView || !R.levelInfo;
  $("#posisiNow").textContent = waktu(Pm.posisiKini); $("#durasiTotal").textContent = waktu(dur);
  tampilPotong(studioView);
}
new ResizeObserver(() => gambarGelombang()).observe(wadah);
function seretPegangan(pegangan, ke) {
  pegangan.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault(); pegangan.setPointerCapture(e.pointerId);
    const gerak = (ev) => {
      const k = wadah.getBoundingClientRect(), f = Math.max(0, Math.min(1, (ev.clientX - k.left) / k.width));
      if (ke === "awal") R.awal = Math.min(f, R.akhir - 0.02); else R.akhir = Math.max(f, R.awal + 0.02);
      gambarGelombang();
    };
    const lepas = () => { pegangan.removeEventListener("pointermove", gerak); pegangan.removeEventListener("pointerup", lepas); pegangan.removeEventListener("pointercancel", lepas); prosesUlang(); };
    pegangan.addEventListener("pointermove", gerak); pegangan.addEventListener("pointerup", lepas); pegangan.addEventListener("pointercancel", lepas);
  });
}
seretPegangan($("#hL"), "awal"); seretPegangan($("#hR"), "akhir");
function aturPosisiDari(e) {
  const x = dataTampil(), k = wadah.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - k.left) / k.width));
  Pm.posisi = f * x.length / R.rate;
  const lp = $("#labelPosisi"); lp.textContent = waktu(Pm.posisi); lp.style.left = Math.max(6, Math.min(94, f * 100)) + "%"; lp.hidden = false;
  gambarGelombang();
}
wadah.addEventListener("pointerdown", (e) => {
  if (!dataTampil()) return;
  const tadiMain = Pm.main; if (tadiMain) hentikanPutar();
  wadah.setPointerCapture(e.pointerId); aturPosisiDari(e);
  const gerak = (ev) => aturPosisiDari(ev);
  const lepas = () => {
    wadah.removeEventListener("pointermove", gerak); wadah.removeEventListener("pointerup", lepas); wadah.removeEventListener("pointercancel", lepas);
    $("#labelPosisi").hidden = true; if (tadiMain) putar();
  };
  wadah.addEventListener("pointermove", gerak); wadah.addEventListener("pointerup", lepas); wadah.addEventListener("pointercancel", lepas);
});
function setLihat(v) {
  R.lihat = v; $$("#ab button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  if (Pm.main) hentikanPutar(); Pm.posisi = 0; gambarGelombang();
}
$$("#ab button").forEach((b) => (b.onclick = () => {
  if (b.dataset.v === "studio" && !R.studio) { toast("Hasil Studio sedang diproses…"); }
  setLihat(b.dataset.v);
}));

// ================= Memutar rekaman =================
const Pm = { ctx: null, src: null, main: false, posisi: 0, mulaiCtx: 0, mulaiPos: 0, bagian: false };
Object.defineProperty(Pm, "posisiKini", { get() { return Pm.main ? Pm.mulaiPos + (Pm.ctx.currentTime - Pm.mulaiCtx) : Pm.posisi; } });
async function siapkanPemutar() {
  if (!Pm.ctx) {
    Pm.ctx = new AudioContext(); Pm.vol = Pm.ctx.createGain(); Pm.vol.gain.value = (P.volPutar ?? 100) / 100;
    const bt = Pm.ctx.createDynamicsCompressor(); bt.threshold.value = -1; bt.knee.value = 0; bt.ratio.value = 20; bt.attack.value = 0.002; bt.release.value = 0.15;
    Pm.vol.connect(bt); bt.connect(Pm.ctx.destination);
  }
  await Pm.ctx.resume();
}
function dataPutar() {
  if (R.lihat !== "studio" && R.musik && R.asli) {
    if (!R.asliMix) R.asliMix = dsp.campurMentah(R.asli, R.musik, R.rate, { volV: P.mixVokal / 100, volM: P.mixMusik / 100, geserMs: R.geser || 0 });
    return R.asliMix;
  }
  return dataTampil();
}
function dataPutarStereo() {
  if (R.lihat === "studio") return R.studioSt;
  if (R.musikSt && R.asli) {
    if (!R.asliMixSt) R.asliMixSt = dsp.campurMentahStereo(R.asli, R.musikSt[0], R.musikSt[1], R.rate, { volV: P.mixVokal / 100, volM: P.mixMusik / 100, geserMs: R.geser || 0 });
    return R.asliMixSt;
  }
  return null;
}
async function putar() {
  const x = dataPutar();
  if (!x) { if (R.asli && R.lihat === "studio") toast("Hasil Studio sedang diproses…"); return; }
  if (M.rek) return;
  await siapkanPemutar();
  const st = dataPutarStereo();
  const b = Pm.ctx.createBuffer(st ? 2 : 1, x.length, R.rate);
  if (st) { b.copyToChannel(st[0].subarray(0, x.length), 0); b.copyToChannel(st[1].subarray(0, x.length), 1); } else b.copyToChannel(x, 0);
  if (Pm.posisi >= x.length / R.rate - 0.05) Pm.posisi = 0;
  Pm.src = Pm.ctx.createBufferSource(); Pm.src.buffer = b; Pm.src.connect(Pm.vol);
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
setInterval(() => {
  if (!Pm.main) return;
  if (Pm.bagian && R.asli && Pm.posisiKini >= R.akhir * (R.asli.length / R.rate)) { Pm.bagian = false; hentikanPutar(false); Pm.posisi = R.awal * (R.asli.length / R.rate); }
  gambarGelombang();
}, 100);
$("#btnPutar").onclick = () => (Pm.main ? hentikanPutar() : putar());

function aturTombol() {
  const ada = !!R.asli;
  $("#btnPutar i").className = "bi " + (Pm.main ? "bi-pause-fill" : "bi-play-fill");
  $$("#daftar .rk").forEach((el) => { const main = Pm.main && el.dataset.n === R.nama; const ic = el.querySelector(".ic i"); if (ic) ic.className = "bi " + (main ? "bi-pause-fill" : "bi-play-fill"); });
  ["#btnGanti", "#btnHapus", "#btnRapikan", "#btnMagic", "#btnWa", "#btnSimpan", "#btnPutar"].forEach((s) => ($(s).disabled = !ada));
}

// ================= Studio (Mix Studio) =================
const prosesUlang = tundaan(async () => {
  if (!R.asli) return;
  const versi = ++R.versi;
  R.studio = null; R.studioSt = null; if (R.lihat === "studio") { if (Pm.main) hentikanPutar(); gambarGelombang(); }
  try {
    let hasil = await dsp.prosesStudio(R.magicAktif && R.vokalMagic ? R.vokalMagic : R.asli, R.rate, { ...P.efek, fokus: 0 }, R.awal, R.akhir);
    if (R.musik && R.mixAuto) {
      const mulai = Math.floor(R.awal * R.asli.length), akhir = Math.ceil(R.akhir * R.asli.length);
      const lv = dsp.levelAktif(hasil, R.rate), lm = dsp.levelAktif(R.musik, R.rate, mulai, akhir);
      P.mixMusik = Math.max(0, Math.min(150, Math.round(100 * Math.pow(10, (lv - 5 - lm) / 20) / 5) * 5));
      R.mixAuto = false; R.asliMix = null; R.asliMixSt = null; simpanMix(); tampilMix();
    }
    let st = null;
    const opsiMix = { volV: P.mixVokal / 100, volM: P.mixMusik / 100, geserMs: R.geser || 0, awal: R.awal, akhir: R.akhir, panjangAsli: R.asli.length };
    if (R.musik && R.musikSt) { st = dsp.campurJalurStereo(hasil, R.musikSt[0], R.musikSt[1], R.rate, opsiMix); hasil = dsp.keMonoDari(st); }
    else if (R.musik) hasil = dsp.campurJalur(hasil, R.musik, R.rate, opsiMix);
    if (versi !== R.versi) return;
    R.studio = hasil; R.studioSt = st; if (R.lihat === "studio") gambarGelombang();
  } catch (e) { toast("Efek gagal: " + e.message, true); }
}, 350);
function terapkanSetelan(s) {
  P.efek = { desisAktif: s.desisAktif, desis: s.desis, penyeimbangAktif: s.penyeimbangAktif, penyeimbang: s.penyeimbang, eqAktif: s.eqAktif, eq: s.eq,
    desisSAktif: s.desisSAktif, gemaAktif: s.gemaAktif, gema: s.gema, keraskanAktif: s.keraskanAktif, nada: s.nada || 0,
    kilauAktif: !!s.kilauAktif, kilau: s.kilau ?? 40, potongBass: s.potongBass || 0, eqCocok: s.eqCocok || null, vokalMaju: !!s.vokalMaju, hangat: !!s.hangat };
  simpanPengaturan(); prosesUlang();
}
function tampilGaya(g) { R.gaya = g; $("#gayaRapikan").hidden = false; $$("#gayaRapikan button").forEach((b) => b.classList.toggle("on", +b.dataset.g === g)); }
$$("#gayaRapikan button").forEach((b) => (b.onclick = () => {
  if (!R.asli || !R.analisa) return;
  const g = +b.dataset.g; if (!R.pita) R.pita = dsp.profilPita(R.asli, R.rate);
  tampilGaya(g); terapkanSetelan(dsp.setelanOtomatis(R.analisa, R.pita, g)); setLihat("studio");
}));
$("#btnRapikan").onclick = async () => {
  if (!R.asli || !R.analisa || R.analisa.pendek) { toast("Pilih rekaman dulu.", true); return; }
  R.magicAktif = false; $("#mvStatus").hidden = true; $("#kartuNada").hidden = true;
  const b = $("#btnRapikan"); b.disabled = true; b.querySelector("span").textContent = "Merapikan…";
  R.pita = dsp.profilPita(R.asli, R.rate);
  const s = dsp.setelanOtomatis(R.analisa, R.pita, R.gaya || 2);
  tampilGaya(R.gaya || 2);
  const bs = dsp.batasSenyap(R.asli, R.rate);
  let dipotong = false;
  if (bs.awal > 0 || bs.akhir < 1) { R.awal = bs.awal; R.akhir = bs.akhir; dipotong = true; }
  terapkanSetelan(s); setLihat("studio");
  for (let i = 0; i < 150 && !R.studio; i++) await tunggu(100);
  b.disabled = false; b.querySelector("span").textContent = "Mix Studio";
  toast("Mix Studio selesai." + (dipotong ? " Bagian senyap di awal/akhir dipotong (Reset untuk membatalkan)." : ""));
  if (R.studio) putar();
};
// Simpan: hasil Studio jadi file baru; rekaman asli sudah tersimpan otomatis
$("#btnSimpan").onclick = async () => {
  if (!R.asli) return;
  if (R.lihat !== "studio") { toast("Rekaman asli sudah tersimpan otomatis. Pilih Studio untuk menyimpan hasil olahan."); return; }
  if (!R.studio) { toast("Hasil Studio sedang diproses…"); return; }
  const dasar = R.nama.replace(/\s*\((Studio|Magic Vocal)\)(\s*\(\d+\))?$/i, "") + (R.magicAktif ? " (Magic Vocal)" : " (Studio)");
  try { const j = await apiJson("rekaman/simpan?" + q({ nama: dasar }), { method: "POST", body: dsp.keWav(R.studioSt || R.studio, R.rate) }); await muatDaftar(); toast("Tersimpan: " + j.nama); }
  catch (e) { toast("Gagal menyimpan: " + e.message, true); }
};

// ================= Potong =================
const potongAktif = () => !!R.asli && (R.awal > 0.0005 || R.akhir < 0.9995);
function batasPotong() { const n = R.asli.length; return [Math.max(0, Math.floor(R.awal * n)), Math.min(n, Math.ceil(R.akhir * n))]; }
const mmss = (d) => { d = Math.max(0, Math.round(d)); return String(Math.floor(d / 60)).padStart(2, "0") + "." + String(d % 60).padStart(2, "0"); };
function labelPotong() { const dur = R.asli.length / R.rate; return "(" + mmss(R.awal * dur) + "–" + mmss(R.akhir * dur) + ")"; }
function tampilPotong() {
  const ada = potongAktif(); $("#bilahPotong").hidden = !ada; if (!ada) return;
  const dur = R.asli.length / R.rate;
  $("#potongWaktu").textContent = waktu(R.awal * dur) + " – " + waktu(R.akhir * dur);
  $("#potongDurasi").textContent = Math.round((R.akhir - R.awal) * dur) + " detik";
}
$("#ptReset").onclick = () => { R.awal = 0; R.akhir = 1; if (Pm.main) hentikanPutar(); gambarGelombang(); prosesUlang(); };
$("#ptPutar").onclick = () => { if (Pm.main) hentikanPutar(); Pm.posisi = R.lihat === "studio" ? 0 : R.awal * (R.asli.length / R.rate); Pm.bagian = R.lihat !== "studio"; putar(); };
$("#ptSimpan").onclick = async () => {
  if (!potongAktif()) return;
  const [p0, p1] = batasPotong();
  if (p1 - p0 < R.rate) { toast("Potongan terlalu pendek (minimal 1 detik).", true); return; }
  const studio = R.lihat === "studio";
  if (studio && !R.studio) { toast("Hasil Studio sedang diproses…"); return; }
  const dasar = R.nama.replace(/\s*\((Studio|Magic Vocal)\)(\s*\(\d+\))?$/i, "") + " " + labelPotong() + (studio ? (R.magicAktif ? " (Magic Vocal)" : " (Studio)") : "");
  const b = $("#ptSimpan"); b.disabled = true;
  try {
    const fade = (x) => { const f = Math.min(Math.floor(R.rate * 0.01), Math.floor(x.length / 4)); for (let i = 0; i < f; i++) { const g = i / f; x[i] *= g; x[x.length - 1 - i] *= g; } return x; };
    const data = studio ? (R.studioSt || R.studio) : fade(R.asli.slice(p0, p1));
    const j = await apiJson("rekaman/simpan?" + q({ nama: dasar }), { method: "POST", body: dsp.keWav(data, R.rate) });
    if (!studio && R.musik) await apiJson("rekaman/musik-simpan?" + q({ nama: j.nama }), { method: "POST", body: dsp.keWav(R.musikSt ? R.musikSt.map((k) => fade(k.slice(p0, Math.min(k.length, p1)))) : fade(R.musik.slice(p0, Math.min(R.musik.length, p1))), R.rate) });
    if (!studio && R.meta) await simpanMeta(j.nama, { ...R.meta });
    await muatDaftar(); toast("Potongan tersimpan: " + j.nama);
  } catch (e) { toast("Gagal menyimpan: " + e.message, true); }
  finally { b.disabled = false; }
};

// ================= WhatsApp =================
$("#btnWa").onclick = async () => {
  if (!R.asli) return;
  const studio = R.lihat === "studio";
  if (studio && !R.studio) { toast("Hasil Studio sedang diproses…"); return; }
  let data = studio ? (R.studioSt || R.studio) : (dataPutarStereo() || dataPutar());
  if (!studio && potongAktif()) { const [p0, p1] = batasPotong(); data = Array.isArray(data) ? data.map((k) => k.slice(p0, p1)) : data.slice(p0, p1); }
  const dasar = R.nama.replace(/\s*\((Studio|Magic Vocal)\)(\s*\(\d+\))?$/i, "") + (potongAktif() ? " " + labelPotong() : "") + (studio ? (R.magicAktif ? " (Magic Vocal)" : " (Studio)") : "");
  const b = $("#btnWa"); b.disabled = true; toast("Membuat file untuk WhatsApp…");
  try {
    // WAV dikirim ke Android, diubah ke M4A (AAC) dengan encoder HP, lalu jendela Bagikan terbuka
    await apiJson("rekaman/ekspor?" + q({ nama: dasar }), { method: "POST", body: dsp.keWav(data, R.rate) });
    toast("File siap (Music/Oru Studio/Untuk WhatsApp). Pilih WhatsApp di jendela Bagikan.");
  } catch (e) { toast("Gagal membuat file WhatsApp: " + e.message, true); }
  finally { b.disabled = false; }
};

// ================= Magic Vocal =================
const TINGKAT = { natural: { k: 60, cepat: 0.12, gema: 8 }, pop: { k: 85, cepat: 0.06, gema: 12 }, autotune: { k: 100, cepat: 0, gema: 10 } };
const namaKunci = (k) => (k ? magic.NADA[k.tonik] + " " + (k.mayor ? "mayor" : "minor") : "");
const MV = { pilihKunci: "auto", kunciAuto: null, tingkat: "pop", kekuatan: 85, untuk: null, kunci: null, lacak: null, sibuk: false, ren: null, awalGrafik: 0 };
const bisaMagic = () => !!(R.musik || (R.meta && R.meta.jenis === "vokal"));
function tampilMV() {
  $$("#mvTingkat button").forEach((d) => d.classList.toggle("on", d.dataset.tk === MV.tingkat));
  const k = $("#mvKekuatan"); k.value = MV.kekuatan; isiSlider(k); $("#mvKekuatanNilai").textContent = MV.kekuatan + "%";
  $("#mvKunci").textContent = MV.kunci ? namaKunci(MV.kunci) : "…";
  $("#mvKunciKet").textContent = MV.pilihKunci !== "auto" ? "Dipilih sendiri" : MV.kunciAuto ? "Terdeteksi otomatis" + (MV.kunciAuto.yakin != null ? " · yakin " + Math.round(MV.kunciAuto.yakin * 100) + "%" : "") : "Membaca kunci lagu…";
  const sel = $("#mvPilihKunci");
  if (!sel.options.length) {
    sel.innerHTML = '<option value="auto">Otomatis</option>' + [true, false].map((mayor) => magic.NADA.map((n, tk) => '<option value="' + tk + (mayor ? "M" : "m") + '">' + n + " " + (mayor ? "mayor" : "minor") + "</option>").join("")).join("");
  }
  sel.value = MV.pilihKunci;
}
$("#mvPilihKunci").onchange = (e) => { const v = e.target.value; MV.pilihKunci = v; MV.kunci = v === "auto" ? MV.kunciAuto : { tonik: parseInt(v, 10), mayor: v.endsWith("M") }; tampilMV(); };
async function siapkanAnalisaMagic() {
  if (MV.untuk === R.nama && MV.kunciAuto) return;
  MV.untuk = R.nama; MV.kunci = null; MV.kunciAuto = null; MV.pilihKunci = "auto"; MV.lacak = null; tampilMV();
  const k = await magic.deteksiKunci(R.musik || R.asli, R.rate);
  if (MV.untuk !== R.nama) return;
  MV.kunciAuto = k; if (MV.pilihKunci === "auto") MV.kunci = k; tampilMV();
}
$("#btnMagic").onclick = () => {
  if (!R.asli) return;
  if (!bisaMagic()) { toast(R.meta && R.meta.jenis === "campur" ? "Magic Vocal butuh rekaman 2 jalur (musik terekam digital)." : "Magic Vocal butuh rekaman 2 jalur.", true); return; }
  $("#mvLatar").hidden = false; tampilMV(); siapkanAnalisaMagic();
};
$("#mvLatar").addEventListener("click", (e) => { if (e.target === $("#mvLatar") && !MV.sibuk) $("#mvLatar").hidden = true; });
$$("#mvTingkat button").forEach((d) => (d.onclick = () => { MV.tingkat = d.dataset.tk; MV.kekuatan = TINGKAT[MV.tingkat].k; tampilMV(); }));
$("#mvKekuatan").addEventListener("input", (e) => { MV.kekuatan = +e.target.value; tampilMV(); });
$("#mvProses").onclick = async () => {
  if (MV.sibuk || !R.asli || !bisaMagic()) return;
  MV.sibuk = true; const tombol = $("#mvProses"), teks = tombol.querySelector("span"); tombol.disabled = true;
  const kemajuan = (p) => (teks.textContent = "Memproses… " + Math.round(p * 100) + "%");
  try {
    kemajuan(0.02); await siapkanAnalisaMagic();
    if (!MV.lacak) MV.lacak = await magic.lacakNada(R.asli, R.rate, (p) => kemajuan(0.05 + p * 0.55));
    const tk = TINGKAT[MV.tingkat];
    MV.ren = magic.rencanaKoreksi(MV.lacak, MV.kunci, MV.kekuatan / 100, tk.cepat);
    let v = await magic.terapkanKoreksi(R.asli, R.rate, MV.lacak, MV.ren, (p) => kemajuan(0.6 + p * 0.3));
    kemajuan(0.92);
    v = magic.setarakanDinamika(v, R.rate);
    R.vokalMagic = v; R.magicAktif = true;
    if (!R.pita) R.pita = dsp.profilPita(R.asli, R.rate);
    const s = dsp.setelanOtomatis(R.analisa, R.pita, 2);
    Object.assign(s, { gemaAktif: true, gema: tk.gema, desisSAktif: true, penyeimbangAktif: true, penyeimbang: 55, vokalMaju: true, keraskanAktif: true });
    $("#gayaRapikan").hidden = true;
    terapkanSetelan(s); setLihat("studio");
    const st = MV.ren.stat;
    $("#mvStatusJudul").textContent = "Magic Vocal: " + $('#mvTingkat [data-tk="' + MV.tingkat + '"] b').textContent;
    $("#mvStatusKet").textContent = st.nadaDikoreksi + " nada dirapikan, fals rata-rata " + st.falsSebelum + " → " + st.falsSesudah + " sen (kunci " + namaKunci(MV.kunci) + ").";
    $("#mvStatus").hidden = false;
    $("#mvLatar").hidden = true;
    tampilGrafikNada(true);
    for (let i = 0; i < 150 && !R.studio; i++) await tunggu(100);
    toast("Magic Vocal selesai. Dengarkan hasilnya.");
    if (R.studio) putar();
  } catch (e) { toast(e.message, true); }
  finally { MV.sibuk = false; tombol.disabled = false; teks.textContent = "Proses Magic Vocal"; }
};
function tampilGrafikNada(cariAwal) {
  const ren = MV.ren, kartu = $("#kartuNada");
  if (!ren || !R.magicAktif) { kartu.hidden = true; return; }
  kartu.hidden = false;
  const n = ren.asli.length, per = Math.round(15 / ren.hop);
  if (cariAwal) {
    let terbaik = 0, nilai = -1;
    for (let a = 0; a + per <= n; a += Math.round(per / 3)) { let s = 0; for (let i = a; i < a + per; i++) s += Math.abs(ren.koreksi[i]); if (s > nilai) { nilai = s; terbaik = a; } }
    MV.awalGrafik = terbaik;
  }
  const a0 = MV.awalGrafik, a1 = Math.min(n, a0 + per);
  $("#nadaWaktu").textContent = waktu(a0 * ren.hop) + " – " + waktu(a1 * ren.hop);
  $("#lgKunci").textContent = namaKunci(MV.kunci);
  const cv = $("#kanvasNada"), dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const ada = []; for (let i = a0; i < a1; i++) if (ren.asli[i]) ada.push(ren.asli[i]);
  ada.sort((p, r) => p - r);
  let lo = ada.length ? ada[Math.floor(ada.length * 0.05)] : 55, hi = ada.length ? ada[Math.floor(ada.length * 0.95)] : 67;
  lo = Math.floor(lo) - 1; hi = Math.max(lo + 7, Math.ceil(hi) + 1);
  const y = (m) => H - 10 - (m - lo) / (hi - lo) * (H - 20), x = (i) => 26 + (i - a0) / per * (W - 30);
  const skala = MV.kunci.mayor ? magic.SKALA_MAYOR : magic.SKALA_MINOR;
  g.font = "600 9px Inter, sans-serif";
  for (let m = lo; m <= hi; m++) {
    if (!skala.includes(((m - MV.kunci.tonik) % 12 + 12) % 12)) continue;
    g.strokeStyle = "rgba(52,211,153,.25)"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(24, y(m) + .5); g.lineTo(W, y(m) + .5); g.stroke(); g.setLineDash([]);
    g.fillStyle = "rgba(148,163,184,.85)"; g.fillText(magic.NADA[((m % 12) + 12) % 12], 2, y(m) + 3);
  }
  const garis = (nilai, warna, tebal, alfa) => {
    g.strokeStyle = warna; g.lineWidth = tebal; g.globalAlpha = alfa; g.beginPath(); let jalan = false, sebelum = 0;
    for (let i = a0; i < a1; i++) {
      const v = nilai(i);
      if (!v || v < lo - 0.5 || v > hi + 0.5) { jalan = false; continue; }
      if (!jalan || Math.abs(v - sebelum) > 3) { g.moveTo(x(i), y(v)); jalan = true; } else g.lineTo(x(i), y(v));
      sebelum = v;
    }
    g.stroke(); g.globalAlpha = 1;
  };
  garis((i) => ren.asli[i], "#cbd5e1", 2.5, 0.7);
  garis((i) => ren.asli[i] && ren.asli[i] + ren.koreksi[i], "#ec4899", 2, 1);
}
$("#nadaKiri").onclick = () => { if (!MV.ren) return; MV.awalGrafik = Math.max(0, MV.awalGrafik - Math.round(15 / MV.ren.hop)); tampilGrafikNada(); };
$("#nadaKanan").onclick = () => { if (!MV.ren) return; MV.awalGrafik = Math.min(Math.max(0, MV.ren.asli.length - Math.round(15 / MV.ren.hop)), MV.awalGrafik + Math.round(15 / MV.ren.hop)); tampilGrafikNada(); };

// ================= Pengaturan & update =================
async function tampilPengaturan() {
  try { $("#versiApp").textContent = (await apiJson("versi")).versi; } catch {}
  $("#folderRekaman").textContent = Oru ? Oru.folder() : "Music/Oru Studio";
  if (Oru) { const s = JSON.parse(Oru.status()); $("#ketBlokir").textContent = s.diblokir + " permintaan iklan diblokir sejak aplikasi dibuka"; }
}
async function cekUpdate(manual) {
  try {
    const j = await apiJson("update/cek");
    if (!j.ada) { if (manual) toast("Sudah versi terbaru (" + j.versi + ")."); $("#ketUpdate").textContent = "Versi " + j.versi + " · terbaru"; return; }
    $("#ketUpdate").textContent = "Versi baru " + j.terbaru + " tersedia";
    if (manual || (await dialog({ judul: "Update tersedia", teks: "Oru Studio " + j.terbaru + " siap dipasang. Pasang sekarang?", ok: "Pasang" }))) {
      toast("Mengunduh update…");
      const p = await apiJson("update/pasang", { method: "POST" });
      if (!p.ok) toast(p.sibuk ? "Sedang merekam, update nanti." : "Update gagal: " + (p.galat || ""), true);
    }
  } catch (e) { if (manual) toast(e.message, true); }
}
$("#btnCekUpdate").onclick = () => cekUpdate(true);

// ================= Mulai =================
(async () => {
  try { Object.assign(P, await apiJson("pengaturan")); } catch {}
  terapkanTema(); tampilVolPanduan(); tampilRekam(); tampilkanKolom();
  await muatDaftar();
  setTimeout(() => cekUpdate(false), 4000);
})();

// untuk uji lewat devtools (adb): window.__oru
window.__oru = { R, P, M, YT, Pm, MV, putar, hentikanPutar, bukaRekaman, bukaHal };
