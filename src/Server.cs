// Orulabs Studio Recording: server lokal kecil yang melayani tampilan (folder "web") di
// http://localhost:47821 lalu membukanya sebagai jendela aplikasi Chrome.
// Merekam, efek studio, dan analisa dikerjakan di tampilan (browser);
// server menangani file rekaman, pencarian YouTube, volume input, dan pengaturan.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace OrulabStudio
{
    static class Program
    {
        public static int Port = 47821; // bisa diganti dengan --port <nomor> (untuk tes)
        /// <summary>Versi aplikasi. Naikkan setiap rilis (tag GitHub: v + versi).</summary>
        public const string Versi = "1.1.6";
        public static string Alamat { get { return "http://localhost:" + Port + "/"; } }
        static string folderWeb;
        static DateTime pingTerakhir = DateTime.Now;
        static readonly object kunciFile = new object();

        static string FolderRekaman
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyMusic), "Rekaman Karaoke"); }
        }
        static string FolderData
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "OrulabStudio"); }
        }

        [STAThread]
        static int Main(string[] args)
        {
            int ip = Array.IndexOf(args, "--port"); int portTes;
            if (ip >= 0 && ip + 1 < args.Length && int.TryParse(args[ip + 1], out portTes)) Port = portTes;
            folderWeb = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web");
            if (!Directory.Exists(folderWeb))
            {
                Pesan("Folder \"web\" tidak ditemukan di samping Orulabs Studio Recording.exe.\n\nEkstrak ulang seluruh isi zip lalu jalankan lagi.");
                return 1;
            }
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288; // TLS 1.2 + 1.3

            var listener = new HttpListener();
            listener.Prefixes.Add(Alamat);
            try { listener.Start(); }
            catch (HttpListenerException)
            {
                // Sudah ada Orulabs Studio Recording yang berjalan: cukup buka jendelanya lagi.
                BukaJendela();
                return 0;
            }

            bool tanpaJendela = Array.IndexOf(args, "--tanpa-jendela") >= 0;
            // Setelah update, jendela lama memuat ulang dirinya sendiri, jadi tidak perlu membuka jendela baru.
            bool setelahUpdate = Array.IndexOf(args, "--setelah-update") >= 0;
            if (!tanpaJendela && !setelahUpdate) BukaJendela();
            Pembaruan.BersihkanSisa();

            // Server berhenti sendiri bila jendela aplikasi sudah lama ditutup (tidak ada ping).
            var penjaga = new Thread(() =>
            {
                while (true)
                {
                    Thread.Sleep(15000);
                    if (!tanpaJendela && (DateTime.Now - pingTerakhir).TotalMinutes > 3) Environment.Exit(0);
                }
            });
            penjaga.IsBackground = true; penjaga.Start();

            while (listener.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = listener.GetContext(); } catch { break; }
                ThreadPool.QueueUserWorkItem(_ => Layani(ctx));
            }
            return 0;
        }

        static void Pesan(string teks)
        {
            try { System.Windows.Forms.MessageBox.Show(teks, "Orulabs Studio Recording"); } catch { }
        }

        /// <summary>Buka tampilan sebagai jendela aplikasi Chrome (profil pengguna, jadi akun YouTube ikut terpakai).</summary>
        static void BukaJendela()
        {
            string lokal = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            var calon = new[] {
                Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(lokal, @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
            };
            foreach (var exe in calon)
            {
                if (!File.Exists(exe)) continue;
                try { Process.Start(exe, "--app=" + Alamat + " --start-maximized"); return; } catch { }
            }
            try { Process.Start(Alamat); } catch { }
        }

        // ================= Penanganan permintaan =================
        static void Layani(HttpListenerContext ctx)
        {
            var req = ctx.Request; var res = ctx.Response;
            try
            {
                string path = req.Url.AbsolutePath;
                if (path.StartsWith("/api/"))
                {
                    // Lindungi API dari halaman web lain: wajib header khusus & asal yang sama.
                    string asal = req.Headers["Origin"];
                    if (req.Headers["X-Orulab"] != "1" || (asal != null && asal.TrimEnd('/') != Alamat.TrimEnd('/')))
                    { Kirim(res, 403, "text/plain", "Ditolak"); return; }
                    Api(path.Substring(5), req, res);
                }
                else FileStatis(path, res);
            }
            catch (Exception ex)
            {
                try { KirimJson(res, 500, "{\"galat\":" + J(ex.Message) + "}"); } catch { }
            }
            finally { try { res.OutputStream.Close(); } catch { } }
        }

        static void Api(string rute, HttpListenerRequest req, HttpListenerResponse res)
        {
            var q = req.QueryString;
            switch (rute)
            {
                case "ping":
                    pingTerakhir = DateTime.Now; KirimJson(res, 200, "{\"ok\":true}"); return;

                case "cari":
                    KirimJson(res, 200, CariYouTube(q["q"] ?? "")); return;

                case "rekaman":
                    KirimJson(res, 200, DaftarRekaman()); return;

                case "rekaman/file":
                {
                    string f = PathRekaman(q["nama"]);
                    if (!File.Exists(f)) { Kirim(res, 404, "text/plain", "Tidak ada"); return; }
                    KirimFile(res, f, "audio/wav"); return;
                }

                case "rekaman/simpan":
                {
                    Directory.CreateDirectory(FolderRekaman);
                    string nama = NamaUnik(Bersihkan(q["nama"] ?? ("Rekaman " + DateTime.Now.ToString("yyyy-MM-dd HH.mm.ss"))));
                    using (var fs = File.Create(Path.Combine(FolderRekaman, nama + ".wav"))) req.InputStream.CopyTo(fs);
                    KirimJson(res, 200, "{\"nama\":" + J(nama) + "}"); return;
                }

                case "rekaman/ganti-nama":
                {
                    string lama = PathRekaman(q["lama"]);
                    string baru = Bersihkan(q["baru"] ?? "");
                    if (!File.Exists(lama) || baru.Length == 0) { KirimJson(res, 400, "{\"galat\":\"Nama tidak valid\"}"); return; }
                    string tujuan = Path.Combine(FolderRekaman, baru + ".wav");
                    if (File.Exists(tujuan)) { KirimJson(res, 409, "{\"galat\":\"Nama itu sudah dipakai\"}"); return; }
                    File.Move(lama, tujuan);
                    KirimJson(res, 200, "{\"nama\":" + J(baru) + "}"); return;
                }

                case "rekaman/hapus":
                {
                    string f = PathRekaman(q["nama"]);
                    if (File.Exists(f))
                        // Dipindah ke Recycle Bin, bukan dihapus permanen.
                        Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(f, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs,
                            Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);
                    KirimJson(res, 200, "{\"ok\":true}"); return;
                }

                case "folder":
                {
                    Directory.CreateDirectory(FolderRekaman);
                    string f = q["nama"] != null ? PathRekaman(q["nama"]) : null;
                    if (f != null && File.Exists(f)) Process.Start("explorer.exe", "/select,\"" + f + "\"");
                    else Process.Start("explorer.exe", "\"" + FolderRekaman + "\"");
                    KirimJson(res, 200, "{\"ok\":true}"); return;
                }

                case "volume":
                {
                    string nama = q["nama"] ?? "";
                    int nilai;
                    if (req.HttpMethod == "POST" && int.TryParse(q["nilai"], out nilai))
                    {
                        bool ok = VolumeInput.Atur(nama, nilai);
                        KirimJson(res, 200, "{\"ok\":" + (ok ? "true" : "false") + ",\"nilai\":" + VolumeInput.Ambil(nama) + "}"); return;
                    }
                    KirimJson(res, 200, "{\"nilai\":" + VolumeInput.Ambil(nama) + "}"); return;
                }

                case "pengaturan":
                {
                    string f = Path.Combine(FolderData, "pengaturan.json");
                    if (req.HttpMethod == "POST")
                    {
                        string isi = BacaBody(req);
                        Directory.CreateDirectory(FolderData);
                        lock (kunciFile) File.WriteAllText(f, isi, Encoding.UTF8);
                        KirimJson(res, 200, "{\"ok\":true}"); return;
                    }
                    string teks;
                    lock (kunciFile) teks = File.Exists(f) ? File.ReadAllText(f, Encoding.UTF8) : "{}";
                    KirimJson(res, 200, teks); return;
                }

                case "playlist-yt":
                    KirimJson(res, 200, PlaylistYouTube(q["link"] ?? "")); return;

                case "terkait":
                    KirimJson(res, 200, Terkait(q["id"])); return;

                case "channel":
                    KirimJson(res, 200, Channel(q["url"], q["tab"])); return;

                case "perpustakaan":
                {
                    // Riwayat lagu dan "Playlist saya", disimpan sebagai satu file JSON.
                    string f = Path.Combine(FolderData, "perpustakaan.json");
                    if (req.HttpMethod == "POST")
                    {
                        string isi = BacaBody(req);
                        Directory.CreateDirectory(FolderData);
                        lock (kunciFile) File.WriteAllText(f, isi, Encoding.UTF8);
                        KirimJson(res, 200, "{\"ok\":true}"); return;
                    }
                    string teks;
                    lock (kunciFile) teks = File.Exists(f) ? File.ReadAllText(f, Encoding.UTF8) : "{\"riwayat\":[],\"playlist\":[]}";
                    KirimJson(res, 200, teks); return;
                }

                case "audio":
                {
                    // Daftar perangkat + bawaan Windows; POST untuk mengganti bawaan (dipakai mode audio).
                    if (req.HttpMethod == "POST")
                    {
                        int arah = q["arah"] == "input" ? 1 : 0;
                        bool ok = PerangkatAudio.AturBawaan(arah, q["nama"] ?? "");
                        KirimJson(res, 200, "{\"ok\":" + (ok ? "true" : "false") + "}"); return;
                    }
                    KirimJson(res, 200, "{\"output\":[" + string.Join(",", PerangkatAudio.Daftar(0).ConvertAll(J).ToArray()) + "],\"input\":["
                        + string.Join(",", PerangkatAudio.Daftar(1).ConvertAll(J).ToArray()) + "],\"bawaanOutput\":" + J(PerangkatAudio.Bawaan(0))
                        + ",\"bawaanInput\":" + J(PerangkatAudio.Bawaan(1)) + "}");
                    return;
                }

                case "versi":
                    KirimJson(res, 200, "{\"versi\":" + J(Versi) + "}"); return;

                case "update/cek":
                    KirimJson(res, 200, Pembaruan.Cek()); return;

                case "update/pasang":
                {
                    if (req.HttpMethod != "POST") { Kirim(res, 405, "text/plain", "POST"); return; }
                    string hasil = Pembaruan.Siapkan();
                    KirimJson(res, 200, hasil);
                    if (hasil.Contains("\"ok\":true"))
                    {
                        // Tutup server sebentar lagi; skrip pembaruan menyalin file lalu menyalakan aplikasi kembali.
                        new Thread(() => { Thread.Sleep(800); Environment.Exit(0); }) { IsBackground = true }.Start();
                    }
                    return;
                }

                case "info":
                    KirimJson(res, 200, "{\"folder\":" + J(FolderRekaman) + ",\"perangkat\":[" + string.Join(",", VolumeInput.Daftar().ConvertAll(J).ToArray()) + "]}");
                    return;
            }
            Kirim(res, 404, "text/plain", "Rute tidak dikenal");
        }

        // ================= File =================
        static readonly Dictionary<string, string> Mime = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
            { ".html", "text/html; charset=utf-8" }, { ".js", "text/javascript; charset=utf-8" }, { ".css", "text/css; charset=utf-8" },
            { ".png", "image/png" }, { ".ico", "image/x-icon" }, { ".svg", "image/svg+xml" }, { ".woff2", "font/woff2" },
            { ".woff", "font/woff" }, { ".json", "application/json" }, { ".wav", "audio/wav" }
        };

        static void FileStatis(string path, HttpListenerResponse res)
        {
            if (path == "/") path = "/index.html";
            string penuh = Path.GetFullPath(Path.Combine(folderWeb, Uri.UnescapeDataString(path).TrimStart('/').Replace('/', '\\')));
            if (!penuh.StartsWith(Path.GetFullPath(folderWeb), StringComparison.OrdinalIgnoreCase) || !File.Exists(penuh))
            { Kirim(res, 404, "text/plain", "Tidak ditemukan"); return; }
            string m; if (!Mime.TryGetValue(Path.GetExtension(penuh), out m)) m = "application/octet-stream";
            res.Headers["Cache-Control"] = "no-cache";
            KirimFile(res, penuh, m);
        }

        static void KirimFile(HttpListenerResponse res, string f, string mime)
        {
            res.StatusCode = 200; res.ContentType = mime;
            using (var fs = File.OpenRead(f)) { res.ContentLength64 = fs.Length; fs.CopyTo(res.OutputStream); }
        }

        static void Kirim(HttpListenerResponse res, int kode, string mime, string teks)
        {
            var b = Encoding.UTF8.GetBytes(teks);
            res.StatusCode = kode; res.ContentType = mime; res.ContentLength64 = b.Length; res.OutputStream.Write(b, 0, b.Length);
        }
        static void KirimJson(HttpListenerResponse res, int kode, string json)
        {
            res.Headers["Cache-Control"] = "no-store";
            Kirim(res, kode, "application/json; charset=utf-8", json);
        }
        static string BacaBody(HttpListenerRequest req)
        {
            using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) return sr.ReadToEnd();
        }

        /// <summary>Teks JSON yang aman (dengan tanda kutip).</summary>
        static string J(string s)
        {
            if (s == null) return "null";
            var sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default: if (c < 32 || c == '<' || c == '>') sb.Append("\\u" + ((int)c).ToString("x4")); else sb.Append(c); break;
                }
            }
            return sb.Append('"').ToString();
        }

        // ================= Rekaman =================
        static string Bersihkan(string nama)
        {
            foreach (char c in Path.GetInvalidFileNameChars()) nama = nama.Replace(c, ' ');
            nama = Regex.Replace(nama, @"\s+", " ").Trim().TrimEnd('.');
            if (nama.EndsWith(".wav", StringComparison.OrdinalIgnoreCase)) nama = nama.Substring(0, nama.Length - 4);
            return nama.Length > 120 ? nama.Substring(0, 120) : nama;
        }

        static string PathRekaman(string nama)
        {
            string b = Bersihkan(nama ?? "");
            return b.Length == 0 ? "" : Path.Combine(FolderRekaman, b + ".wav");
        }

        static string NamaUnik(string nama)
        {
            if (nama.Length == 0) nama = "Rekaman";
            string hasil = nama; int i = 2;
            while (File.Exists(Path.Combine(FolderRekaman, hasil + ".wav"))) hasil = nama + " (" + (i++) + ")";
            return hasil;
        }

        static string DaftarRekaman()
        {
            var sb = new StringBuilder("[");
            if (Directory.Exists(FolderRekaman))
            {
                var files = new DirectoryInfo(FolderRekaman).GetFiles("*.wav");
                Array.Sort(files, (a, b) => b.LastWriteTime.CompareTo(a.LastWriteTime));
                bool pertama = true;
                foreach (var f in files)
                {
                    if (!pertama) sb.Append(','); pertama = false;
                    sb.Append("{\"nama\":").Append(J(Path.GetFileNameWithoutExtension(f.Name)))
                      .Append(",\"ukuran\":").Append(f.Length)
                      .Append(",\"waktu\":").Append(J(f.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ss", System.Globalization.CultureInfo.InvariantCulture)))
                      .Append(",\"durasi\":").Append(DurasiWav(f.FullName).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture))
                      .Append('}');
                }
            }
            return sb.Append(']').ToString();
        }

        /// <summary>Durasi WAV dalam detik dari header (0 bila tidak terbaca).</summary>
        static double DurasiWav(string path)
        {
            try
            {
                using (var br = new BinaryReader(File.OpenRead(path)))
                {
                    br.ReadBytes(12); int byteRate = 0;
                    while (br.BaseStream.Position + 8 <= br.BaseStream.Length)
                    {
                        string id = Encoding.ASCII.GetString(br.ReadBytes(4)); int len = br.ReadInt32();
                        if (id == "fmt ") { br.ReadBytes(8); byteRate = br.ReadInt32(); br.BaseStream.Seek(len - 12, SeekOrigin.Current); }
                        else if (id == "data") return byteRate > 0 ? (double)len / byteRate : 0;
                        else br.BaseStream.Seek(len + (len & 1), SeekOrigin.Current);
                    }
                }
            }
            catch { }
            return 0;
        }

        // ================= YouTube (tanpa login, tanpa kunci API) =================
        // Semua halaman YouTube (cari, playlist, tonton, channel) memakai format item yang sama
        // ("lockupViewModel"); format lama ("videoRenderer", "playlistVideoRenderer") tetap dibaca.

        const string UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

        static string UnduhYouTube(string url)
        {
            for (int coba = 0; ; coba++)
            {
                try
                {
                    using (var wc = new WebClient())
                    {
                        wc.Encoding = Encoding.UTF8;
                        wc.Headers[HttpRequestHeader.UserAgent] = UA;
                        wc.Headers[HttpRequestHeader.AcceptLanguage] = "id-ID,id;q=0.9,en;q=0.8";
                        return wc.DownloadString(url);
                    }
                }
                catch (WebException) { if (coba >= 1) throw; Thread.Sleep(400); }
            }
        }

        const string TEKS = "((?:[^\"\\\\]|\\\\.)*)";

        /// <summary>Satu item YouTube (video atau playlist) sebagai JSON.</summary>
        static string Item(string jenis, string id, string judul, string channel, string url, string durasi)
        {
            return "{\"jenis\":" + J(jenis) + ",\"id\":" + J(id) + ",\"judul\":" + J(UnescapeJson(judul ?? "")) + ",\"channel\":" + J(UnescapeJson(channel ?? ""))
                + ",\"url\":" + J(url ?? "") + ",\"durasi\":" + J(durasi ?? "") + "}";
        }

        /// <summary>Ambil daftar video/playlist dari halaman YouTube. jenisDiminta: "video", "playlist", atau null (semua).</summary>
        static List<string> AmbilItem(string html, string jenisDiminta, int maks, string kecuali = null)
        {
            var hasil = new List<string>(); var sudah = new HashSet<string>();
            if (kecuali != null) sudah.Add(kecuali);

            // Format baru
            var potong = html.Split(new[] { "{\"lockupViewModel\":{" }, StringSplitOptions.None);
            for (int i = 1; i < potong.Length && hasil.Count < maks; i++)
            {
                string bag = potong[i].Length > 20000 ? potong[i].Substring(0, 20000) : potong[i];
                string tipe = Ambil(bag, "\"contentType\":\"LOCKUP_CONTENT_TYPE_([A-Z_]+)\"") ?? "VIDEO";
                string jenis = tipe == "PLAYLIST" || tipe == "PODCAST" ? "playlist" : tipe == "VIDEO" ? "video" : null;
                if (jenis == null || (jenisDiminta != null && jenis != jenisDiminta)) continue;
                string judul = Ambil(bag, "\"lockupMetadataViewModel\":\\{\"title\":\\{\"content\":\"" + TEKS + "\"");
                string id = Ambil(bag, "\"contentId\":\"([A-Za-z0-9_-]+)\"");
                if (jenis == "video" && (id == null || id.Length != 11)) id = Ambil(bag, @"i\.ytimg\.com/vi/([A-Za-z0-9_-]{11})/");
                if (id == null || judul == null || !sudah.Add(id)) continue;
                string channel = Ambil(bag, "\"metadataParts\":\\[\\{\"text\":\\{\"content\":\"" + TEKS + "\"");
                string url = Ambil(bag, "\"url\":\"(/@[^\"/?]+|/channel/[^\"/?]+)\"");
                string durasi = jenis == "video"
                    ? Ambil(bag, "\"thumbnailBadgeViewModel\":\\{.*?\"text\":\"([0-9]+[:.][0-9:.]+)\"")
                    : Ambil(bag, "\"thumbnailBadgeViewModel\":\\{.*?\"text\":\"([^\"]*)\"");
                hasil.Add(Item(jenis, id, judul, channel, url, durasi));
            }

            // Format lama: hasil cari dan isi playlist
            foreach (var pemisah in new[] { "\"videoRenderer\":{\"videoId\":\"", "\"playlistVideoRenderer\":{\"videoId\":\"" })
            {
                if (jenisDiminta == "playlist") break;
                var bagian = html.Split(new[] { pemisah }, StringSplitOptions.None);
                for (int i = 1; i < bagian.Length && hasil.Count < maks; i++)
                {
                    string bag = bagian[i].Length > 8000 ? bagian[i].Substring(0, 8000) : bagian[i];
                    if (bag.IndexOf('"') != 11) continue;
                    string id = bag.Substring(0, 11);
                    string judul = Ambil(bag, "\"title\":\\{\"runs\":\\[\\{\"text\":\"" + TEKS + "\"");
                    if (judul == null || !sudah.Add(id)) continue;
                    string channel = Ambil(bag, "\"(?:ownerText|shortBylineText)\":\\{\"runs\":\\[\\{\"text\":\"" + TEKS + "\"");
                    string url = Ambil(bag, "\"canonicalBaseUrl\":\"([^\"]+)\"");
                    string durasi = Ambil(bag, "\"lengthText\":\\{[^}]*?\\}\\},\"simpleText\":\"([^\"]*)\"") ?? Ambil(bag, "\"lengthText\":\\{\"simpleText\":\"([^\"]*)\"");
                    hasil.Add(Item("video", id, judul, channel, url, durasi));
                }
            }
            return hasil;
        }

        static string Daftar(List<string> item) { return "[" + string.Join(",", item.ToArray()) + "]"; }

        static string CariYouTube(string kata)
        {
            if (kata.Trim().Length == 0) return "[]";
            // Link video yang ditempel langsung: putar video itu.
            var v = Regex.Match(kata, @"(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{11})");
            if (v.Success) return "[" + Item("video", v.Groups[1].Value, "Video dari link", "", "", "") + "]";
            // YouTube kadang mengirim halaman berbeda; coba lagi bila kosong.
            for (int coba = 0; coba < 3; coba++)
            {
                var item = AmbilItem(UnduhYouTube("https://www.youtube.com/results?sp=EgIQAQ%3D%3D&search_query=" + Uri.EscapeDataString(kata)), "video", 30);
                if (item.Count > 0) return Daftar(item);
                Thread.Sleep(400);
            }
            return "[]";
        }

        /// <summary>Lagu berikutnya (saran YouTube) dan channel pemilik video.</summary>
        static string Terkait(string id)
        {
            if (!Regex.IsMatch(id ?? "", "^[A-Za-z0-9_-]{11}$")) return "{\"galat\":\"ID video tidak valid\"}";
            string html = UnduhYouTube("https://www.youtube.com/watch?v=" + id);
            int sek = html.IndexOf("\"secondaryResults\":{");
            string bagian = sek >= 0 ? html.Substring(sek) : html;
            var item = AmbilItem(bagian, "video", 25, id);
            string pemilik = null, urlPemilik = null;
            int o = html.IndexOf("\"videoOwnerRenderer\":{");
            if (o >= 0)
            {
                string b = html.Substring(o, Math.Min(4000, html.Length - o));
                pemilik = Ambil(b, "\"title\":\\{\"runs\":\\[\\{\"text\":\"" + TEKS + "\"");
                urlPemilik = Ambil(b, "\"canonicalBaseUrl\":\"([^\"]+)\"");
            }
            string judul = Ambil(html, "<meta name=\"title\" content=\"([^\"]*)\"");
            return "{\"judul\":" + J(WebUtility.HtmlDecode(judul ?? "")) + ",\"channel\":" + J(UnescapeJson(pemilik ?? "")) + ",\"url\":" + J(urlPemilik ?? "")
                + ",\"video\":" + Daftar(item) + "}";
        }

        /// <summary>Halaman channel: tab "videos" atau "playlists".</summary>
        static string Channel(string alamat, string tab)
        {
            alamat = (alamat ?? "").Trim();
            var m = Regex.Match(alamat, @"(/@[^/?#\s]+|/channel/[^/?#\s]+|/c/[^/?#\s]+|/user/[^/?#\s]+)");
            string path;
            if (m.Success) path = m.Groups[1].Value;
            else
            {
                var at = Regex.Match(alamat, @"^@?([A-Za-z0-9._-]+)$");
                if (!at.Success) return "{\"galat\":\"Link channel tidak dikenali. Contoh: https://www.youtube.com/@namachannel\"}";
                path = "/@" + at.Groups[1].Value;
            }
            string jenis = tab == "playlists" ? "playlist" : "video";
            string html;
            try { html = UnduhYouTube("https://www.youtube.com" + path + "/" + (jenis == "playlist" ? "playlists" : "videos")); }
            catch (WebException) { return "{\"galat\":\"Channel tidak ditemukan.\"}"; }
            string nama = WebUtility.HtmlDecode(Ambil(html, "<meta property=\"og:title\" content=\"([^\"]*)\"") ?? "");
            string foto = Ambil(html, "<meta property=\"og:image\" content=\"([^\"]*)\"") ?? "";
            return "{\"nama\":" + J(nama) + ",\"foto\":" + J(foto) + ",\"url\":" + J(path) + ",\"item\":" + Daftar(AmbilItem(html, jenis, 60)) + "}";
        }

        /// <summary>Isi playlist YouTube publik/unlisted dari link (playlist pribadi butuh login Google).</summary>
        static string PlaylistYouTube(string link)
        {
            link = (link ?? "").Trim();
            var m = Regex.Match(link, @"[?&]list=([A-Za-z0-9_-]+)");
            string id = m.Success ? m.Groups[1].Value : (Regex.IsMatch(link, @"^[A-Za-z0-9_-]{12,}$") ? link : null);
            if (id == null) return "{\"galat\":\"Link playlist tidak dikenali. Salin link yang berisi 'list=...'.\"}";
            if (id == "WL" || id == "LL" || id.StartsWith("LM"))
                return "{\"galat\":\"Tonton nanti dan Video yang disukai bersifat pribadi, tidak bisa dibuka tanpa login Google.\"}";
            string html;
            try { html = UnduhYouTube("https://www.youtube.com/playlist?list=" + Uri.EscapeDataString(id)); }
            catch (WebException) { return "{\"galat\":\"Playlist tidak ditemukan atau bersifat pribadi.\"}"; }
            var item = AmbilItem(html, "video", 200);
            if (item.Count == 0) return "{\"galat\":\"Playlist kosong atau bersifat pribadi. Ubah ke Publik/Tidak publik di YouTube lalu coba lagi.\"}";
            string judul = Ambil(html, "<meta property=\"og:title\" content=\"([^\"]*)\"");
            return "{\"judul\":" + J(WebUtility.HtmlDecode(judul ?? "Playlist YouTube")) + ",\"id\":" + J(id) + ",\"video\":" + Daftar(item) + "}";
        }

        static string Ambil(string teks, string pola)
        {
            var m = Regex.Match(teks, pola, RegexOptions.Singleline);
            return m.Success ? m.Groups[1].Value : null;
        }

        static string UnescapeJson(string s)
        {
            return Regex.Replace(s, @"\\(u[0-9a-fA-F]{4}|.)", m =>
            {
                string v = m.Groups[1].Value;
                if (v.Length == 5) return ((char)Convert.ToInt32(v.Substring(1), 16)).ToString();
                switch (v) { case "n": return "\n"; case "t": return "\t"; case "r": return ""; default: return v; }
            });
        }
    }
}
