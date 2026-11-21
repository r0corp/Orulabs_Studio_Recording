package id.orulabs.orustudio;

import android.content.Context;
import android.media.MediaScannerConnection;
import android.os.Environment;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Server kecil di 127.0.0.1 (seperti versi laptop): melayani tampilan dari aset APK dan API rekaman/YouTube.
 * Tampilan memakai fetch biasa, jadi kode olah suara (dsp.js, magic.js, ekspor.js) sama dengan versi laptop.
 */
final class Server {
    static final int PORT = 47821;
    private static final String TAG = "OruServer";
    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
    private static final String TEKS = "((?:[^\"\\\\]|\\\\.)*)";
    private static final Object KUNCI = new Object();

    private final Context ctx;
    private ServerSocket ss;

    Server(Context ctx) { this.ctx = ctx.getApplicationContext(); dataAplikasi = this.ctx.getFilesDir(); }

    // ---------- folder ----------
    static File folderRekaman() { return new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "Oru Studio"); }
    static File folderMusik() { return new File(folderRekaman(), "Jalur musik"); }
    // data per rekaman (JSON) disimpan di folder aplikasi: folder Music hanya menerima file audio
    private static File dataAplikasi;
    static File folderMeta() { return new File(dataAplikasi, "Data rekaman"); }
    static File folderWa() { return new File(folderRekaman(), "Untuk WhatsApp"); }

    static String bersihkan(String nama) {
        if (nama == null) return "";
        nama = nama.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", " ").replaceAll("\\s+", " ").trim();
        while (nama.endsWith(".")) nama = nama.substring(0, nama.length() - 1);
        if (nama.toLowerCase(Locale.ROOT).endsWith(".wav")) nama = nama.substring(0, nama.length() - 4);
        return nama.length() > 120 ? nama.substring(0, 120) : nama;
    }
    static String namaUnik(String nama) {
        if (nama.isEmpty()) nama = "Rekaman";
        String h = nama; int i = 2;
        while (new File(folderRekaman(), h + ".wav").exists()) h = nama + " (" + (i++) + ")";
        return h;
    }
    private static File fRekaman(String n) { return new File(folderRekaman(), bersihkan(n) + ".wav"); }
    private static File fMusik(String n) { return new File(folderMusik(), bersihkan(n) + ".wav"); }
    private static File fMeta(String n) { return new File(folderMeta(), bersihkan(n) + ".json"); }

    void pindai(File... f) {
        String[] p = new String[f.length];
        for (int i = 0; i < f.length; i++) p[i] = f[i].getAbsolutePath();
        MediaScannerConnection.scanFile(ctx, p, null, null);
    }

    // ---------- server ----------
    void mulai() {
        new Thread(() -> {
            try {
                ss = new ServerSocket(PORT, 32, InetAddress.getByName("127.0.0.1"));
                while (!ss.isClosed()) {
                    Socket s = ss.accept();
                    new Thread(() -> layani(s), "http").start();
                }
            } catch (IOException e) { Log.e(TAG, "server berhenti", e); }
        }, "server").start();
    }

    private void layani(Socket s) {
        try (Socket sock = s) {
            sock.setSoTimeout(120000);
            InputStream in = sock.getInputStream();
            String baris = bacaBaris(in);
            if (baris == null) return;
            String[] bag = baris.split(" ");
            if (bag.length < 2) return;
            String metode = bag[0], target = bag[1];
            Map<String, String> kepala = new HashMap<>();
            String b;
            while ((b = bacaBaris(in)) != null && !b.isEmpty()) {
                int c = b.indexOf(':');
                if (c > 0) kepala.put(b.substring(0, c).trim().toLowerCase(Locale.ROOT), b.substring(c + 1).trim());
            }
            byte[] body = new byte[0];
            String cl = kepala.get("content-length");
            if (cl != null) {
                int n = Integer.parseInt(cl);
                body = new byte[n];
                int o = 0;
                while (o < n) { int r = in.read(body, o, n - o); if (r < 0) break; o += r; }
            }
            String path = target, query = "";
            int t = target.indexOf('?');
            if (t >= 0) { path = target.substring(0, t); query = target.substring(t + 1); }
            Map<String, String> q = parseQuery(query);
            OutputStream out = sock.getOutputStream();
            try {
                if (path.startsWith("/api/")) api(path.substring(5), metode, q, body, out);
                else statis(path, out);
            } catch (Exception e) {
                Log.e(TAG, "galat " + path, e);
                kirim(out, 500, "application/json", ("{\"galat\":" + J(String.valueOf(e.getMessage())) + "}").getBytes(StandardCharsets.UTF_8));
            }
            out.flush();
        } catch (IOException ignored) {}
    }

    private static String bacaBaris(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) >= 0) { if (c == '\n') break; if (c != '\r') b.write(c); }
        if (c < 0 && b.size() == 0) return null;
        return b.toString("UTF-8");
    }

    private static Map<String, String> parseQuery(String q) {
        Map<String, String> m = new HashMap<>();
        if (q.isEmpty()) return m;
        for (String p : q.split("&")) {
            int e = p.indexOf('=');
            try {
                if (e < 0) m.put(URLDecoder.decode(p, "UTF-8"), "");
                else m.put(URLDecoder.decode(p.substring(0, e), "UTF-8"), URLDecoder.decode(p.substring(e + 1), "UTF-8"));
            } catch (Exception ignored) {}
        }
        return m;
    }

    private static void kirim(OutputStream out, int kode, String tipe, byte[] isi) throws IOException {
        String h = "HTTP/1.1 " + kode + " OK\r\nContent-Type: " + tipe + "\r\nContent-Length: " + isi.length
                + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        out.write(h.getBytes(StandardCharsets.US_ASCII));
        out.write(isi);
    }
    private static void kirimJson(OutputStream out, String json) throws IOException { kirim(out, 200, "application/json; charset=utf-8", json.getBytes(StandardCharsets.UTF_8)); }
    private static void kirimFile(OutputStream out, File f, String tipe) throws IOException {
        String h = "HTTP/1.1 200 OK\r\nContent-Type: " + tipe + "\r\nContent-Length: " + f.length() + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        out.write(h.getBytes(StandardCharsets.US_ASCII));
        try (InputStream in = new FileInputStream(f)) { salin(in, out); }
    }
    private static void salin(InputStream in, OutputStream out) throws IOException {
        byte[] b = new byte[65536]; int n;
        while ((n = in.read(b)) > 0) out.write(b, 0, n);
    }

    private void statis(String path, OutputStream out) throws IOException {
        if (path.equals("/") || path.isEmpty()) path = "/app/index.html";
        String nama = URLDecoder.decode(path.substring(1), "UTF-8");
        if (nama.contains("..")) { kirim(out, 404, "text/plain", new byte[0]); return; }
        byte[] isi;
        try (InputStream in = ctx.getAssets().open(nama)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream(); salin(in, b); isi = b.toByteArray();
        } catch (IOException e) { kirim(out, 404, "text/plain", "Tidak ada".getBytes(StandardCharsets.UTF_8)); return; }
        kirim(out, 200, tipe(nama), isi);
    }

    private static String tipe(String n) {
        n = n.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".ico")) return "image/x-icon";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".woff")) return "font/woff";
        if (n.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    // ---------- API ----------
    private void api(String rute, String metode, Map<String, String> q, byte[] body, OutputStream out) throws Exception {
        boolean post = "POST".equals(metode);
        switch (rute) {
            case "cari": kirimJson(out, cariYouTube(nz(q.get("q")))); return;
            case "terkait": kirimJson(out, terkait(q.get("id"))); return;
            case "rekaman": kirimJson(out, daftarRekaman()); return;
            case "rekaman/file": {
                File f = fRekaman(q.get("nama"));
                if (!f.exists()) { kirim(out, 404, "text/plain", new byte[0]); return; }
                kirimFile(out, f, "audio/wav"); return;
            }
            case "rekaman/musik": {
                File f = fMusik(q.get("nama"));
                if (!f.exists()) { kirim(out, 404, "text/plain", new byte[0]); return; }
                kirimFile(out, f, "audio/wav"); return;
            }
            case "rekaman/simpan": {
                // ?timpa=1: tulis ulang rekaman yang sudah ada (vokal sesudah dikeraskan)
                folderRekaman().mkdirs();
                String nama = bersihkan(q.get("nama"));
                if (!"1".equals(q.get("timpa"))) nama = namaUnik(nama.isEmpty() ? "Rekaman " + new SimpleDateFormat("yyyy-MM-dd HH.mm.ss", Locale.US).format(new java.util.Date()) : nama);
                File f = new File(folderRekaman(), nama + ".wav");
                tulis(f, body); pindai(f);
                kirimJson(out, "{\"nama\":" + J(nama) + "}"); return;
            }
            case "rekaman/musik-simpan": {
                String nama = bersihkan(q.get("nama"));
                if (nama.isEmpty() || !fRekaman(nama).exists()) { kirimJson(out, "{\"galat\":\"Rekaman tidak ditemukan\"}"); return; }
                folderMusik().mkdirs();
                tulis(fMusik(nama), body);
                kirimJson(out, "{\"ok\":true}"); return;
            }
            case "rekaman/meta": {
                File f = fMeta(q.get("nama"));
                if (post) {
                    folderMeta().mkdirs();
                    synchronized (KUNCI) { tulis(f, body); }
                    kirimJson(out, "{\"ok\":true}"); return;
                }
                String t;
                synchronized (KUNCI) { t = f.exists() ? bacaTeks(f) : "{}"; }
                kirimJson(out, t.trim().isEmpty() ? "{}" : t); return;
            }
            case "rekaman/ganti-nama": {
                File lama = fRekaman(q.get("lama"));
                String baru = bersihkan(q.get("baru"));
                if (!lama.exists() || baru.isEmpty()) { kirimJson(out, "{\"galat\":\"Nama tidak valid\"}"); return; }
                File tujuan = new File(folderRekaman(), baru + ".wav");
                if (tujuan.exists()) { kirimJson(out, "{\"galat\":\"Nama itu sudah dipakai\"}"); return; }
                if (!lama.renameTo(tujuan)) { kirimJson(out, "{\"galat\":\"Gagal mengganti nama\"}"); return; }
                File m = fMusik(q.get("lama")); if (m.exists()) m.renameTo(fMusik(baru));
                File d = fMeta(q.get("lama")); if (d.exists()) d.renameTo(fMeta(baru));
                pindai(lama, tujuan);
                kirimJson(out, "{\"nama\":" + J(baru) + "}"); return;
            }
            case "rekaman/hapus": {
                for (File f : new File[]{fRekaman(q.get("nama")), fMusik(q.get("nama")), fMeta(q.get("nama"))})
                    if (f.exists()) { f.delete(); pindai(f); }
                kirimJson(out, "{\"ok\":true}"); return;
            }
            case "rekaman/ekspor": {
                // simpan M4A di "Untuk WhatsApp" lalu buka jendela Bagikan Android
                String nama = bersihkan(q.get("nama")); if (nama.isEmpty()) nama = "Rekaman";
                folderWa().mkdirs();
                File f = new File(folderWa(), nama + ".m4a");
                final String judulWa = nama;
                // tampilan mengirim WAV; diubah ke M4A (AAC) di sini karena WebView HP tidak punya encoder AAC
                if (body.length > 4 && body[0] == 'R' && body[1] == 'I') KeM4a.ubah(body, f); else tulis(f, body);
                MediaScannerConnection.scanFile(ctx, new String[]{f.getAbsolutePath()}, new String[]{"audio/mp4"},
                        (p, uri) -> MainActivity.bagikan(uri, judulWa));
                kirimJson(out, "{\"ok\":true,\"nama\":" + J(nama + ".m4a") + "}"); return;
            }
            case "pengaturan": {
                File f = new File(ctx.getFilesDir(), "pengaturan.json");
                if (post) { synchronized (KUNCI) { tulis(f, body); } kirimJson(out, "{\"ok\":true}"); return; }
                String t; synchronized (KUNCI) { t = f.exists() ? bacaTeks(f) : "{}"; }
                kirimJson(out, t); return;
            }
            case "folder-rekaman": kirimJson(out, "{\"folder\":" + J(folderRekaman().getAbsolutePath()) + "}"); return;
            case "versi": kirimJson(out, "{\"versi\":" + J(BuildConfig.VERSION_NAME) + "}"); return;
            case "update/cek": kirimJson(out, Pembaruan.cek()); return;
            case "update/pasang": {
                if (RekamService.aktif) { kirimJson(out, "{\"ok\":false,\"sibuk\":true}"); return; }
                kirimJson(out, Pembaruan.pasang(ctx)); return;
            }
        }
        kirim(out, 404, "text/plain", "Rute tidak dikenal".getBytes(StandardCharsets.UTF_8));
    }

    private static String nz(String s) { return s == null ? "" : s; }

    static void tulis(File f, byte[] isi) throws IOException {
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(isi); }
    }
    private static String bacaTeks(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream(); salin(in, b);
            String s = b.toString("UTF-8");
            return s.startsWith("﻿") ? s.substring(1) : s;
        }
    }

    private static String daftarRekaman() {
        File[] fs = folderRekaman().listFiles((d, n) -> n.toLowerCase(Locale.ROOT).endsWith(".wav"));
        if (fs == null) return "[]";
        Arrays.sort(fs, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
        StringBuilder sb = new StringBuilder("[");
        for (File f : fs) {
            String nama = f.getName().substring(0, f.getName().length() - 4);
            if (sb.length() > 1) sb.append(',');
            sb.append("{\"nama\":").append(J(nama)).append(",\"ukuran\":").append(f.length())
              .append(",\"waktu\":").append(J(iso.format(new java.util.Date(f.lastModified()))))
              .append(",\"durasi\":").append(String.format(Locale.US, "%.1f", durasiWav(f)))
              .append(",\"musik\":").append(new File(folderMusik(), f.getName()).exists())
              .append('}');
        }
        return sb.append(']').toString();
    }

    /** Durasi WAV dari header (byte rate dan ukuran data). */
    static double durasiWav(File f) {
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
            byte[] h = new byte[12]; r.readFully(h);
            long pos = 12; int byteRate = 0;
            while (pos + 8 <= r.length()) {
                r.seek(pos); byte[] c = new byte[8]; r.readFully(c);
                String id = new String(c, 0, 4, StandardCharsets.US_ASCII);
                long size = (c[4] & 0xffL) | (c[5] & 0xffL) << 8 | (c[6] & 0xffL) << 16 | (c[7] & 0xffL) << 24;
                if (id.equals("fmt ")) { r.seek(pos + 16); byte[] b = new byte[4]; r.readFully(b); byteRate = (b[0] & 0xff) | (b[1] & 0xff) << 8 | (b[2] & 0xff) << 16 | (b[3] & 0xff) << 24; }
                if (id.equals("data")) return byteRate > 0 ? Math.min(size, r.length() - pos - 8) / (double) byteRate : 0;
                pos += 8 + size + (size & 1);
            }
        } catch (IOException ignored) {}
        return 0;
    }

    // ---------- YouTube (sama dengan versi laptop) ----------
    static String unduh(String url) throws IOException {
        IOException akhir = null;
        for (int coba = 0; coba < 2; coba++) {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setRequestProperty("User-Agent", UA);
                c.setRequestProperty("Accept-Language", "id-ID,id;q=0.9,en;q=0.8");
                c.setConnectTimeout(15000); c.setReadTimeout(20000);
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream b = new ByteArrayOutputStream(); salin(in, b);
                    return b.toString("UTF-8");
                }
            } catch (IOException e) { akhir = e; try { Thread.sleep(400); } catch (InterruptedException ignored) {} }
        }
        throw akhir;
    }

    private static String ambil(String teks, String pola) {
        Matcher m = Pattern.compile(pola, Pattern.DOTALL).matcher(teks);
        return m.find() ? m.group(1) : null;
    }

    private static String unescapeJson(String s) {
        Matcher m = Pattern.compile("\\\\(u[0-9a-fA-F]{4}|.)").matcher(s);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String v = m.group(1), r;
            if (v.length() == 5) r = String.valueOf((char) Integer.parseInt(v.substring(1), 16));
            else if (v.equals("n")) r = "\n"; else if (v.equals("t")) r = "\t"; else if (v.equals("r")) r = ""; else r = v;
            m.appendReplacement(sb, Matcher.quoteReplacement(r));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private static String item(String jenis, String id, String judul, String channel, String url, String durasi) {
        return "{\"jenis\":" + J(jenis) + ",\"id\":" + J(id) + ",\"judul\":" + J(unescapeJson(nz(judul))) + ",\"channel\":" + J(unescapeJson(nz(channel)))
                + ",\"url\":" + J(nz(url)) + ",\"durasi\":" + J(nz(durasi)) + "}";
    }

    private static List<String> ambilItem(String html, String jenisDiminta, int maks, String kecuali) {
        List<String> hasil = new ArrayList<>(); Set<String> sudah = new HashSet<>();
        if (kecuali != null) sudah.add(kecuali);
        String[] potong = html.split(Pattern.quote("{\"lockupViewModel\":{"), -1);
        for (int i = 1; i < potong.length && hasil.size() < maks; i++) {
            String bag = potong[i].length() > 20000 ? potong[i].substring(0, 20000) : potong[i];
            String tipe = ambil(bag, "\"contentType\":\"LOCKUP_CONTENT_TYPE_([A-Z_]+)\""); if (tipe == null) tipe = "VIDEO";
            String jenis = tipe.equals("PLAYLIST") || tipe.equals("PODCAST") ? "playlist" : tipe.equals("VIDEO") ? "video" : null;
            if (jenis == null || (jenisDiminta != null && !jenis.equals(jenisDiminta))) continue;
            String judul = ambil(bag, "\"lockupMetadataViewModel\":\\{\"title\":\\{\"content\":\"" + TEKS + "\"");
            String id = ambil(bag, "\"contentId\":\"([A-Za-z0-9_-]+)\"");
            if (jenis.equals("video") && (id == null || id.length() != 11)) id = ambil(bag, "i\\.ytimg\\.com/vi/([A-Za-z0-9_-]{11})/");
            if (id == null || judul == null || !sudah.add(id)) continue;
            String channel = ambil(bag, "\"metadataParts\":\\[\\{\"text\":\\{\"content\":\"" + TEKS + "\"");
            String url = ambil(bag, "\"url\":\"(/@[^\"/?]+|/channel/[^\"/?]+)\"");
            String durasi = jenis.equals("video")
                    ? ambil(bag, "\"thumbnailBadgeViewModel\":\\{.*?\"text\":\"([0-9]+[:.][0-9:.]+)\"")
                    : ambil(bag, "\"thumbnailBadgeViewModel\":\\{.*?\"text\":\"([^\"]*)\"");
            hasil.add(item(jenis, id, judul, channel, url, durasi));
        }
        for (String pemisah : new String[]{"\"videoRenderer\":{\"videoId\":\"", "\"playlistVideoRenderer\":{\"videoId\":\""}) {
            if ("playlist".equals(jenisDiminta)) break;
            String[] bagian = html.split(Pattern.quote(pemisah), -1);
            for (int i = 1; i < bagian.length && hasil.size() < maks; i++) {
                String bag = bagian[i].length() > 8000 ? bagian[i].substring(0, 8000) : bagian[i];
                if (bag.indexOf('"') != 11) continue;
                String id = bag.substring(0, 11);
                String judul = ambil(bag, "\"title\":\\{\"runs\":\\[\\{\"text\":\"" + TEKS + "\"");
                if (judul == null || !sudah.add(id)) continue;
                String channel = ambil(bag, "\"(?:ownerText|shortBylineText)\":\\{\"runs\":\\[\\{\"text\":\"" + TEKS + "\"");
                String url = ambil(bag, "\"canonicalBaseUrl\":\"([^\"]+)\"");
                String durasi = ambil(bag, "\"lengthText\":\\{[^}]*?\\}\\},\"simpleText\":\"([^\"]*)\"");
                if (durasi == null) durasi = ambil(bag, "\"lengthText\":\\{\"simpleText\":\"([^\"]*)\"");
                hasil.add(item("video", id, judul, channel, url, durasi));
            }
        }
        return hasil;
    }

    private static String daftar(List<String> item) { return "[" + String.join(",", item) + "]"; }

    static String cariYouTube(String kata) throws Exception {
        if (kata.trim().isEmpty()) return "[]";
        Matcher v = Pattern.compile("(?:v=|youtu\\.be/|shorts/)([A-Za-z0-9_-]{11})").matcher(kata);
        if (v.find()) return "[" + item("video", v.group(1), "Video dari link", "", "", "") + "]";
        for (int coba = 0; coba < 3; coba++) {
            List<String> item = ambilItem(unduh("https://www.youtube.com/results?sp=EgIQAQ%3D%3D&search_query=" + URLEncoder.encode(kata, "UTF-8")), "video", 30, null);
            if (!item.isEmpty()) return daftar(item);
            Thread.sleep(400);
        }
        return "[]";
    }

    static String terkait(String id) throws Exception {
        if (id == null || !id.matches("^[A-Za-z0-9_-]{11}$")) return "{\"galat\":\"ID video tidak valid\"}";
        String html = unduh("https://www.youtube.com/watch?v=" + id);
        int sek = html.indexOf("\"secondaryResults\":{");
        List<String> item = ambilItem(sek >= 0 ? html.substring(sek) : html, "video", 25, id);
        String pemilik = null, urlPemilik = null;
        int o = html.indexOf("\"videoOwnerRenderer\":{");
        if (o >= 0) {
            String b = html.substring(o, Math.min(html.length(), o + 4000));
            pemilik = ambil(b, "\"title\":\\{\"runs\":\\[\\{\"text\":\"" + TEKS + "\"");
            urlPemilik = ambil(b, "\"canonicalBaseUrl\":\"([^\"]+)\"");
        }
        String judul = ambil(html, "<meta name=\"title\" content=\"([^\"]*)\"");
        return "{\"judul\":" + J(android.text.Html.fromHtml(nz(judul), 0).toString()) + ",\"channel\":" + J(unescapeJson(nz(pemilik)))
                + ",\"url\":" + J(nz(urlPemilik)) + ",\"video\":" + daftar(item) + "}";
    }

    static String J(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format(Locale.US, "\\u%04x", (int) c)); else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }
}
