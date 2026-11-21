// Buat ulang screenshot README dengan rekaman contoh buatan (bukan rekaman pengguna), folder data sementara.
// Jalankan sesudah .\build.ps1:  node tests/screenshot.mjs
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import * as dsp from "../web/dsp.js";

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE = path.join(AKAR, "dist", "Orulabs Studio Recording", "Orulabs Studio Recording.exe");
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => fs.existsSync(p));
const OUT = path.join(AKAR, "docs", "screenshots"), PORT = 47898, CDP = 9398, TMP = path.join(os.tmpdir(), "orulabs-shot");
const DATA = path.join(TMP, "data"), REK = path.join(TMP, "rekaman");
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- rekaman contoh: vokal (melodi bervibrato) + jalur musik stereo (akor) ----------
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(path.join(REK, "Jalur musik"), { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(path.join(DATA, "folder-rekaman.txt"), REK);
fs.writeFileSync(path.join(DATA, "pengaturan.json"), JSON.stringify({ warna: "mawar", mode: "glass-dark", bahasa: "id", modeKerja: "rekam", modeAudio: "rumah",
  profil: { rumah: { input: "Microphone (USB Audio)", output: "Speaker Mixer (Bluetooth)", putar: "Speakers (Laptop)" }, laptop: { input: "Microphone Array (Laptop)", output: "Speakers (Laptop)", putar: "Speakers (Laptop)" } } }));
const R = 48000, DET = 48;
const melodi = [67, 69, 71, 72, 71, 69, 67, 64, 67, 69, 71, 74, 72, 71, 69, 67]; // G mayor
function vokal(salahSen) {
  const n = R * DET, x = new Float32Array(n); let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / R, not = Math.floor(t / 3) % melodi.length, dalam = (t % 3) / 3, frasa = Math.floor(t / 12) % 2 === 0 || dalam < 0.85;
    const m = melodi[not] + (salahSen[not % salahSen.length] / 100) + 0.12 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, dalam * 3);
    const f = 440 * Math.pow(2, (m - 12 - 69) / 12); fase += f / R;
    const env = frasa && dalam < 0.92 ? Math.min(1, dalam * 20) * (0.7 + 0.3 * Math.sin(2 * Math.PI * t * 0.7)) : 0;
    x[i] = env * 0.22 * (Math.sin(2 * Math.PI * fase) + 0.5 * Math.sin(4 * Math.PI * fase) + 0.25 * Math.sin(6 * Math.PI * fase)) + (Math.random() * 2 - 1) * 0.002;
  }
  return x;
}
function musik() {
  const n = R * DET, L = new Float32Array(n), Rk = new Float32Array(n), akor = [[55, 59, 62], [60, 64, 67], [62, 66, 69], [55, 59, 62]];
  for (let i = 0; i < n; i++) {
    const t = i / R, a = akor[Math.floor(t / 6) % 4], ketuk = Math.exp(-((t % 0.5) * 8));
    let s = 0; for (const m of a) s += Math.sin(2 * Math.PI * 440 * Math.pow(2, (m - 69) / 12) * t);
    const bass = Math.sin(2 * Math.PI * 440 * Math.pow(2, (a[0] - 24 - 69) / 12) * t) * ketuk;
    L[i] = 0.09 * s + 0.25 * bass + 0.05 * Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-((t % 0.25) * 60));
    Rk[i] = 0.08 * s * 0.9 + 0.25 * bass + 0.05 * Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-(((t + 0.125) % 0.25) * 60));
  }
  return [L, Rk];
}
const simpan = async (f, data) => fs.writeFileSync(f, Buffer.from(await dsp.keWav(data, R).arrayBuffer()));
await simpan(path.join(REK, "Contoh – Lagu Pop 20.15.wav"), vokal([0, 35, -25, 10, 40, -30, 0, 20]));
await simpan(path.join(REK, "Jalur musik", "Contoh – Lagu Pop 20.15.wav"), musik());
await simpan(path.join(REK, "Contoh – Ballad 19.40.wav"), vokal([10, -15, 0, 25]));
await simpan(path.join(REK, "Jalur musik", "Contoh – Ballad 19.40.wav"), musik());

// ---------- aplikasi + Chrome ----------
const srv = spawn(EXE, ["--tanpa-jendela", "--port", String(PORT), "--data", DATA]);
await jeda(1500);
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + CDP, "--user-data-dir=" + path.join(TMP, "chrome"), "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream", "--mute-audio", "about:blank"]);
await jeda(2500);
const tab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); let id = 0; const tunggu = {};
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && tunggu[m.id]) { tunggu[m.id](m); delete tunggu[m.id]; } };
await new Promise((r) => (ws.onopen = r));
const k = (method, params = {}) => new Promise((r) => { const i = ++id; tunggu[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => { const r = await k("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? "EXC" : r.result.result.value; };
const ukuran = (w, h) => k("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const foto = async (nama) => { await k("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 }); await jeda(300); const s = await k("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, nama), Buffer.from(s.result.data, "base64")); console.log("  " + nama); };
const seret = async (sel, f) => {
  const h = JSON.parse(await js(`JSON.stringify(document.querySelector('${sel}').getBoundingClientRect())`)), g = JSON.parse(await js(`JSON.stringify(document.querySelector('#gelombang').getBoundingClientRect())`));
  const x0 = Math.min(h.x + h.width / 2, g.x + g.width - 2), y = g.y + g.height / 2, x1 = g.x + g.width * f;
  await k("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 6; i++) await k("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + (x1 - x0) * i / 6, y, button: "left", buttons: 1 });
  await k("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y, button: "left", buttons: 0, clickCount: 1 });
};
try {
  await ukuran(1920, 1080);
  await k("Page.navigate", { url: `http://localhost:${PORT}/?tes=1` }); await jeda(6000);
  // YouTube: cari lagu, buka hasil pertama (disiapkan)
  await js(`document.querySelector('#kata').value = 'karaoke kerispatih'; document.querySelector('#cari').requestSubmit()`); await jeda(6000);
  { const r = JSON.parse(await js(`JSON.stringify(document.querySelector('#kolom .vi').getBoundingClientRect())`));
    for (const type of ["mousePressed", "mouseReleased"]) await k("Input.dispatchMouseEvent", { type, x: r.x + r.width / 2, y: r.y + r.height / 2, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 }); }
  await jeda(8000);
  await js(`document.querySelector('#daftar .item[data-n="Contoh – Lagu Pop 20.15"] b').click()`); await jeda(7000);
  await foto("01-utama.png");
  // Magic Vocal: proses Pop, tampilkan grafik nada
  await js(`document.querySelector('#btnMagic').click()`); await jeda(2500);
  await foto("02-magic-vocal.png");
  await js(`document.querySelector('#mvProses').click()`); await jeda(6000);
  await js(`document.querySelector('.tabs [data-tab="analisa"]').click()`); await jeda(800);
  await foto("03-grafik-nada.png");
  // Potong
  await js(`document.querySelector('.tabs [data-tab="studio"]').click(); document.querySelector('#ab [data-v="asli"]').click()`); await jeda(600);
  await seret("#hL", 0.25); await jeda(300); await seret("#hR", 0.6); await jeda(800);
  await foto("04-potong.png");
  await js(`document.querySelector('#ptReset').click()`); await jeda(400);
  // Pengaturan
  await js(`document.querySelector('#btnPengaturan').click()`); await jeda(1000);
  await foto("05-pengaturan.png");
  await js(`document.querySelector('#tutupPengaturan').click()`); await jeda(400);
  // English + terang
  await js(`document.querySelector('#ddBahasa .dd-btn').click()`); await jeda(200);
  await js(`[...document.querySelectorAll('#ddBahasa .dd-op')].find(o => o.innerText.startsWith('English')).click()`); await jeda(300);
  await js(`document.querySelector('#tema [data-m="glass-light"]').click()`); await jeda(800);
  await foto("06-english-terang.png");
  // layar kecil
  await js(`document.querySelector('#tema [data-m="glass-dark"]').click()`); await jeda(200);
  await js(`document.querySelector('#ddBahasa .dd-btn').click()`); await jeda(200);
  await js(`[...document.querySelectorAll('#ddBahasa .dd-op')].find(o => o.innerText.startsWith('Indonesia')).click()`); await jeda(300);
  await ukuran(1280, 800); await jeda(1500);
  await foto("07-layar-kecil.png");
} finally { ws.close(); chrome.kill(); srv.kill(); await jeda(800); fs.rmSync(TMP, { recursive: true, force: true }); }
