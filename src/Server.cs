// Orulab Studio: server lokal kecil yang melayani tampilan (folder "web") di
// http://localhost:47821 lalu membukanya sebagai jendela aplikasi Chrome.
// Merekam, efek studio, dan analisa dikerjakan di tampilan (browser);
// server menangani file rekaman, pencarian YouTube, volume input, dan pengaturan.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace OrulabStudio
{
    static class Program
    {
        public const int Port = 47821;
        public static readonly string Alamat = "http://localhost:" + Port + "/";
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
            folderWeb = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web");
            if (!Directory.Exists(folderWeb))
            {
                Pesan("Folder \"web\" tidak ditemukan di samping Orulab Studio.exe.\n\nEkstrak ulang seluruh isi zip lalu jalankan lagi.");
                return 1;
            }
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288; // TLS 1.2 + 1.3

            var listener = new HttpListener();
            listener.Prefixes.Add(Alamat);
            try { listener.Start(); }
            catch (HttpListenerException)
            {
                // Sudah ada Orulab Studio yang berjalan: cukup buka jendelanya lagi.
                BukaJendela();
                return 0;
            }

            bool tanpaJendela = Array.IndexOf(args, "--tanpa-jendela") >= 0;
            if (!tanpaJendela) BukaJendela();

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
            try { System.Windows.Forms.MessageBox.Show(teks, "Orulab Studio"); } catch { }
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

                case "kunci-claude":
                {
                    // Kunci API disimpan terenkripsi dengan akun Windows (DPAPI).
                    string f = Path.Combine(FolderData, "kunci-claude.bin");
                    if (req.HttpMethod == "POST")
                    {
                        string kunci = BacaBody(req).Trim();
                        Directory.CreateDirectory(FolderData);
                        if (kunci.Length == 0) { if (File.Exists(f)) File.Delete(f); }
                        else File.WriteAllBytes(f, ProtectedData.Protect(Encoding.UTF8.GetBytes(kunci), null, DataProtectionScope.CurrentUser));
                        KirimJson(res, 200, "{\"ok\":true}"); return;
                    }
                    string hasil = "";
                    try { if (File.Exists(f)) hasil = Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(f), null, DataProtectionScope.CurrentUser)); } catch { }
                    KirimJson(res, 200, "{\"kunci\":" + J(hasil) + "}"); return;
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

        // ================= Pencarian YouTube =================
        /// <summary>Cari video di halaman hasil YouTube (tanpa kunci API) lalu kembalikan JSON daftar video.</summary>
        static string CariYouTube(string kata)
        {
            if (kata.Trim().Length == 0) return "[]";
            // YouTube kadang mengirim halaman berbeda; coba sekali lagi bila hasilnya kosong.
            for (int coba = 0; coba < 3; coba++)
            {
                string hasil = CariYouTubeSekali(kata);
                if (hasil != "[]") return hasil;
                Thread.Sleep(400);
            }
            return "[]";
        }

        static string CariYouTubeSekali(string kata)
        {
            string html;
            using (var wc = new WebClient())
            {
                wc.Encoding = Encoding.UTF8;
                wc.Headers[HttpRequestHeader.UserAgent] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
                wc.Headers[HttpRequestHeader.AcceptLanguage] = "id-ID,id;q=0.9,en;q=0.8";
                // sp=EgIQAQ%3D%3D = hanya video
                html = wc.DownloadString("https://www.youtube.com/results?sp=EgIQAQ%3D%3D&search_query=" + Uri.EscapeDataString(kata));
            }
            var hasil = new StringBuilder("["); var sudah = new HashSet<string>(); int jumlah = 0;
            var potong = html.Split(new[] { "\"videoRenderer\":{\"videoId\":\"" }, StringSplitOptions.None);
            for (int i = 1; i < potong.Length && jumlah < 16; i++)
            {
                string bag = potong[i].Length > 8000 ? potong[i].Substring(0, 8000) : potong[i];
                int kutip = bag.IndexOf('"'); if (kutip != 11) continue;
                string id = bag.Substring(0, 11);
                if (!sudah.Add(id)) continue;
                string judul = Ambil(bag, "\"title\":\\{\"runs\":\\[\\{\"text\":\"((?:[^\"\\\\]|\\\\.)*)\"");
                if (judul == null) continue;
                string channel = Ambil(bag, "\"ownerText\":\\{\"runs\":\\[\\{\"text\":\"((?:[^\"\\\\]|\\\\.)*)\"") ?? "";
                string durasi = Ambil(bag, "\"lengthText\":\\{[^}]*?\\}\\},\"simpleText\":\"([^\"]*)\"")
                             ?? Ambil(bag, "\"lengthText\":\\{\"simpleText\":\"([^\"]*)\"") ?? "";
                if (jumlah > 0) hasil.Append(',');
                hasil.Append("{\"id\":").Append(J(id)).Append(",\"judul\":").Append(J(UnescapeJson(judul)))
                     .Append(",\"channel\":").Append(J(UnescapeJson(channel))).Append(",\"durasi\":").Append(J(durasi)).Append('}');
                jumlah++;
            }
            return hasil.Append(']').ToString();
        }

        static string Ambil(string teks, string pola)
        {
            var m = Regex.Match(teks, pola);
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
