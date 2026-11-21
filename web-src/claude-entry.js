// Modul "Rapikan dengan Claude" untuk Orulab Studio.
// Yang dikirim ke Claude hanya ANGKA hasil analisa rekaman, bukan suaranya.
// Dibundel dengan esbuild menjadi web/vendor/claude.js.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";

const SISTEM = `Kamu adalah sound engineer studio rekaman. Pengguna merekam karaoke di rumah:
musik YouTube dan vokal dicampur di mixer, lalu direkam sebagai SATU jalur mono.
Karena tercampur, efek berlaku untuk musik dan vokal sekaligus.

Tugasmu: dari angka analisa rekaman, pilih setelan efek studio terbaik agar hasilnya
bersih, stabil, jernih, dan enak didengar seperti rekaman profesional, tanpa berlebihan.

Efek yang tersedia (nilai 0-100):
- desis: bersihkan desis/dengung latar (noise gate). Naikkan bila lantai derau tinggi.
- penyeimbang: kompresor, membuat bagian pelan dan keras lebih stabil.
- eq: EQ vokal, mengurangi bass berlebih (~250 Hz) dan menambah kejelasan (~3 kHz).
- desisS: kurangi bunyi "s" yang tajam (aktif/tidak).
- gema: reverb ruang. Biasanya 10-35. Terlalu tinggi membuat suara jauh.
- keraskan: naikkan kekerasan akhir setara lagu streaming tanpa pecah (aktif/tidak).
- nada: transpose seluruh lagu dalam semitone (-4..4). Biarkan 0 kecuali diminta.

Balas HANYA dengan satu objek JSON tanpa teks lain, dengan kunci persis:
{"desisAktif":bool,"desis":int,"penyeimbangAktif":bool,"penyeimbang":int,"eqAktif":bool,"eq":int,
"desisSAktif":bool,"gemaAktif":bool,"gema":int,"keraskanAktif":bool,"nada":int,
"pesan":"1-2 kalimat Bahasa Indonesia yang santai, jelaskan apa yang kamu ubah dan kenapa"}`;

function angka(v, min, max, cadangan) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : cadangan;
}

/** Validasi dan rapikan JSON balasan Claude menjadi setelan efek yang aman. */
function rapikanSetelan(j) {
  return {
    desisAktif: !!j.desisAktif, desis: angka(j.desis, 0, 100, 40),
    penyeimbangAktif: !!j.penyeimbangAktif, penyeimbang: angka(j.penyeimbang, 0, 100, 40),
    eqAktif: !!j.eqAktif, eq: angka(j.eq, 0, 100, 50),
    desisSAktif: !!j.desisSAktif,
    gemaAktif: !!j.gemaAktif, gema: angka(j.gema, 0, 100, 20),
    keraskanAktif: j.keraskanAktif !== false,
    nada: angka(j.nada, -4, 4, 0),
    pesan: typeof j.pesan === "string" ? j.pesan.slice(0, 400) : "Setelan studio sudah diterapkan.",
  };
}

/**
 * Minta Claude memilih setelan efek dari angka analisa.
 * @param {string} kunci  Kunci API Claude milik pengguna (disimpan lokal di laptop).
 * @param {object} analisa  Angka hasil analisa rekaman.
 */
export async function mintaSaranClaude(kunci, analisa) {
  // Aplikasi berjalan lokal di laptop pengguna (localhost), kunci milik pengguna sendiri.
  const client = new Anthropic({ apiKey: kunci, dangerouslyAllowBrowser: true });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SISTEM,
    messages: [{ role: "user", content: "Angka analisa rekaman:\n" + JSON.stringify(analisa, null, 2) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude menolak permintaan ini. Coba lagi atau pakai setelan otomatis.");
  }
  let teks = "";
  for (const block of response.content) if (block.type === "text") teks += block.text;
  const awal = teks.indexOf("{"), akhir = teks.lastIndexOf("}");
  if (awal < 0 || akhir <= awal) throw new Error("Balasan Claude tidak berisi setelan.");
  let json;
  try { json = JSON.parse(teks.slice(awal, akhir + 1)); }
  catch { throw new Error("Balasan Claude tidak bisa dibaca."); }
  return rapikanSetelan(json);
}

/** Ubah galat API menjadi pesan yang mudah dimengerti. */
export function pesanGalat(e) {
  if (e instanceof Anthropic.AuthenticationError) return "Kunci API Claude salah atau sudah tidak berlaku.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Kunci API ini tidak punya izin memakai Claude.";
  if (e instanceof Anthropic.RateLimitError) return "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.";
  if (e instanceof Anthropic.APIConnectionError) return "Tidak bisa terhubung ke Claude. Cek koneksi internet.";
  if (e instanceof Anthropic.APIError) return "Claude sedang bermasalah (" + (e.status || "?") + "). Coba lagi nanti.";
  return e && e.message ? e.message : String(e);
}
