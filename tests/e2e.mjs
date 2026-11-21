// Tes menyeluruh: aplikasi hasil build (dist) dijalankan di port 47899 dengan folder data terpisah, dibuka di Chrome
// tanpa jendela dengan mic palsu. Tidak menyentuh setelan/rekaman pengguna dan tidak mengubah perangkat audio Windows.
// Jalankan sesudah .\build.ps1:  node tests/e2e.mjs
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXE = path.join(AKAR, "dist", "Orulabs Studio Recording", "Orulabs Studio Recording.exe");
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => fs.existsSync(p));
const PORT = 47899, CDP = 9399, TMP = path.join(os.tmpdir(), "orulabs-e2e");
const DATA = path.join(TMP, "data"), REKAMAN = path.join(TMP, "rekaman"), PROFIL = path.join(TMP, "chrome");
const SETELAN_ASLI = path.join(process.env.APPDATA || "", "OrulabStudio", "pengaturan.json");
const sidik = (f) => (fs.existsSync(f) ? createHash("sha1").update(fs.readFileSync(f)).digest("hex") : "-");

let gagal = 0;
const cek = (nama, ok, info = "") => { console.log((ok ? "  ✓ " : "  ✗ ") + nama + (info ? "  (" + info + ")" : "")); if (!ok) gagal++; };
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(REKAMAN, { recursive: true });
fs.writeFileSync(path.join(DATA, "folder-rekaman.txt"), REKAMAN);
const sidikAwal = sidik(SETELAN_ASLI);

const srv = spawn(EXE, ["--tanpa-jendela", "--port", String(PORT), "--data", DATA]);
await jeda(1500);
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + CDP, "--user-data-dir=" + PROFIL, "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "about:blank"]);
await jeda(2500);
const tab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); let id = 0; const tunggu = {}; const galat = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && tunggu[m.id]) { tunggu[m.id](m); delete tunggu[m.id]; }
  if (m.method === "Runtime.exceptionThrown") galat.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
await new Promise((r) => (ws.onopen = r));
const k = (method, params = {}) => new Promise((r) => { const i = ++id; tunggu[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => { const r = await k("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? "EXC " + (r.result.exceptionDetails.exception?.description || "") : r.result.result.value; };
const klik = async (sel) => { const r = JSON.parse(await js(`JSON.stringify(document.querySelector('${sel}').getBoundingClientRect())`));
  for (const type of ["mousePressed", "mouseReleased"]) await k("Input.dispatchMouseEvent", { type, x: r.x + r.width / 2, y: r.y + r.height / 2, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 }); };
const seret = async (sel, f) => {
  const h = JSON.parse(await js(`JSON.stringify(document.querySelector('${sel}').getBoundingClientRect())`)), g = JSON.parse(await js(`JSON.stringify(document.querySelector('#gelombang').getBoundingClientRect())`));
  const x0 = Math.min(h.x + h.width / 2, g.x + g.width - 2), y = g.y + g.height / 2, x1 = g.x + g.width * f;
  await k("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 6; i++) await k("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + (x1 - x0) * i / 6, y, button: "left", buttons: 1 });
  await k("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y, button: "left", buttons: 0, clickCount: 1 });
};
const daftar = async () => (await (await fetch(`http://localhost:${PORT}/api/rekaman`, { headers: { "X-Orulab": "1" } })).json());

try {
  await k("Runtime.enable");
  await k("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await k("Page.navigate", { url: `http://localhost:${PORT}/?tes=1` }); await jeda(6000);
  console.log("Halaman");
  cek("terbuka, versi tampil", /^\d+\.\d+\.\d+$/.test(await js(`document.querySelector('#versiApp').textContent`)));

  console.log("Merekam");
  await klik("#btnRekam"); await jeda(5000); await klik("#btnRekam"); await jeda(2500);
  let d = await daftar();
  cek("rekaman tersimpan", d.length === 1, d.length + " rekaman");
  cek("panjang ±5 detik", d[0] && Math.abs(d[0].durasi - 5) < 1, d[0] && d[0].durasi + " dtk");

  console.log("Mix Studio");
  await klik("#btnRapikan"); await jeda(4000);
  cek("pilihan hasil tampil", await js(`!document.querySelector('#gayaRapikan').hidden`));
  cek("hasil Studio diproses", await js(`document.querySelector('#ab .on').dataset.v === 'studio'`));

  console.log("Magic Vocal");
  await klik("#btnMagic"); await jeda(800);
  cek("rekaman 1 jalur: panel tidak dibuka", await js(`document.querySelector('#mvPop').hidden`));

  console.log("Potong");
  await js(`document.querySelector('#ptReset') && document.querySelector('#ptReset').click()`); await jeda(400);
  await js(`document.querySelector('#ab [data-v="asli"]').click()`); await jeda(300);
  cek("bilah tersembunyi sebelum ditarik", await js(`document.querySelector('#bilahPotong').hidden`));
  await seret("#hL", 0.2); await jeda(300); await seret("#hR", 0.7); await jeda(600);
  cek("bilah muncul setelah ditarik", await js(`!document.querySelector('#bilahPotong').hidden`));
  await klik("#ptSimpan"); await jeda(2500);
  d = await daftar();
  const pot = d.find((r) => /\(\d\d\.\d\d–\d\d\.\d\d\)/.test(r.nama));
  cek("potongan tersimpan", !!pot, pot && pot.nama + ", " + pot.durasi + " dtk");

  console.log("Pengaturan");
  await klik("#btnPengaturan"); await jeda(800);
  cek("laci terbuka tanpa gulir", await js(`(() => { const b = document.querySelector('.laci .badan'); return b.scrollHeight <= b.clientHeight + 2; })()`));
  cek("baris kalibrasi tampil", (await js(`document.querySelector('#kalNilai').textContent`)).length > 0);

  console.log("Bahasa");
  await js(`document.querySelector('#ddBahasa .dd-btn').click()`); await jeda(200);
  await js(`[...document.querySelectorAll('#ddBahasa .dd-op')].find(o => o.innerText.startsWith('English')).click()`); await jeda(500);
  cek("English diterapkan", (await js(`document.querySelector('#btnRapikan span').textContent`)) === "Studio Mix");

  console.log("Keamanan data");
  cek("tidak ada galat di halaman", galat.length === 0, galat.join(" | ").slice(0, 200));
  cek("setelan pengguna tidak berubah", sidik(SETELAN_ASLI) === sidikAwal);
} catch (e) { cek("tes berjalan", false, e.message); }
finally { ws.close(); chrome.kill(); srv.kill(); await jeda(800); fs.rmSync(TMP, { recursive: true, force: true }); }

console.log(gagal ? "\n" + gagal + " tes GAGAL" : "\nSemua tes menyeluruh lolos");
process.exit(gagal ? 1 : 0);
