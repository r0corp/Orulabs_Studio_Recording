// Update otomatis dari GitHub Releases (pola sama dengan aplikasi Orulabs lain).
// Cek: bandingkan tag rilis terbaru (v1.2.3) dengan Program.Versi.
// Pasang: unduh Orulabs-Studio-Recording.zip, ekstrak ke folder sementara, lalu skrip kecil
// menunggu aplikasi tertutup, menyalin file baru ke folder aplikasi, dan menyalakannya lagi.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace OrulabStudio
{
    static class Pembaruan
    {
        public const string Repo = "r0corp/Orulabs_Studio_Recording";
        const string NamaAset = "Orulabs-Studio-Recording.zip";
        static string FolderSementara { get { return Path.Combine(Path.GetTempPath(), "OrulabsStudioUpdate"); } }

        static string urlAset, versiBaru;

        static string Unduh(string url)
        {
            using (var wc = new WebClient())
            {
                wc.Encoding = Encoding.UTF8;
                wc.Headers[HttpRequestHeader.UserAgent] = "OrulabsStudioRecording/" + Program.Versi;
                wc.Headers[HttpRequestHeader.Accept] = "application/vnd.github+json";
                return wc.DownloadString(url);
            }
        }

        /// <summary>Bandingkan versi "1.2.3". Positif bila a lebih baru dari b.</summary>
        static int Banding(string a, string b)
        {
            var x = a.TrimStart('v', 'V').Split('.'); var y = b.TrimStart('v', 'V').Split('.');
            for (int i = 0; i < Math.Max(x.Length, y.Length); i++)
            {
                int p = 0, q = 0;
                if (i < x.Length) int.TryParse(Regex.Match(x[i], @"\d+").Value, out p);
                if (i < y.Length) int.TryParse(Regex.Match(y[i], @"\d+").Value, out q);
                if (p != q) return p - q;
            }
            return 0;
        }

        static string J(string s)
        {
            if (s == null) return "null";
            var sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                if (c == '"') sb.Append("\\\""); else if (c == '\\') sb.Append("\\\\"); else if (c == '\n') sb.Append("\\n");
                else if (c == '\r') { } else if (c < 32 || c == '<' || c == '>') sb.Append("\\u" + ((int)c).ToString("x4")); else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        static string Bacakan(string teks)
        {
            return Regex.Replace(teks ?? "", @"\\(u[0-9a-fA-F]{4}|.)", m =>
            {
                string v = m.Groups[1].Value;
                if (v.Length == 5) return ((char)Convert.ToInt32(v.Substring(1), 16)).ToString();
                return v == "n" ? "\n" : v == "r" ? "" : v == "t" ? "\t" : v;
            });
        }

        /// <summary>Cek rilis terbaru di GitHub. Hasil JSON: versi kini, versi terbaru, ada update atau tidak, catatan rilis.</summary>
        public static string Cek()
        {
            try
            {
                string json = Unduh("https://api.github.com/repos/" + Repo + "/releases/latest");
                string tag = Regex.Match(json, "\"tag_name\"\\s*:\\s*\"([^\"]+)\"").Groups[1].Value;
                string judul = Bacakan(Regex.Match(json, "\"name\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").Groups[1].Value);
                string catatan = Bacakan(Regex.Match(json, "\"body\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").Groups[1].Value);
                var aset = Regex.Match(json, "\"browser_download_url\"\\s*:\\s*\"([^\"]*" + Regex.Escape(NamaAset) + ")\"");
                urlAset = aset.Success ? aset.Groups[1].Value : null;
                versiBaru = tag.TrimStart('v', 'V');
                bool ada = tag.Length > 0 && urlAset != null && Banding(tag, Program.Versi) > 0;
                return "{\"versi\":" + J(Program.Versi) + ",\"terbaru\":" + J(versiBaru) + ",\"ada\":" + (ada ? "true" : "false")
                    + ",\"judul\":" + J(judul) + ",\"catatan\":" + J(catatan.Length > 1500 ? catatan.Substring(0, 1500) : catatan) + "}";
            }
            catch (WebException ex)
            {
                var r = ex.Response as HttpWebResponse;
                if (r != null && r.StatusCode == HttpStatusCode.NotFound)
                    return "{\"versi\":" + J(Program.Versi) + ",\"ada\":false,\"terbaru\":" + J(Program.Versi) + "}";
                return "{\"versi\":" + J(Program.Versi) + ",\"ada\":false,\"galat\":\"Tidak bisa mengecek update. Cek koneksi internet.\"}";
            }
        }

        /// <summary>Unduh dan siapkan update, lalu jalankan skrip penyalin yang menunggu aplikasi tertutup.</summary>
        public static string Siapkan()
        {
            try
            {
                // Selalu cek ulang: aplikasi bisa terbuka lama dan rilis baru bisa terbit setelah cek terakhir.
                urlAset = null; Cek();
                if (urlAset == null || Banding(versiBaru ?? "", Program.Versi) <= 0) return "{\"ok\":false,\"galat\":\"Tidak ada update.\"}";
                string sementara = FolderSementara;
                if (Directory.Exists(sementara)) Directory.Delete(sementara, true);
                Directory.CreateDirectory(sementara);
                string zip = Path.Combine(sementara, NamaAset);
                using (var wc = new WebClient())
                {
                    wc.Headers[HttpRequestHeader.UserAgent] = "OrulabsStudioRecording/" + Program.Versi;
                    wc.DownloadFile(urlAset, zip);
                }
                string ekstrak = Path.Combine(sementara, "isi");
                ZipFile.ExtractToDirectory(zip, ekstrak);
                string[] exe = Directory.GetFiles(ekstrak, "Orulabs Studio Recording.exe", SearchOption.AllDirectories);
                if (exe.Length == 0) return "{\"ok\":false,\"galat\":\"Isi file update tidak lengkap.\"}";
                string sumber = Path.GetDirectoryName(exe[0]);
                string tujuan = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
                int pid = Process.GetCurrentProcess().Id;

                string skrip = Path.Combine(sementara, "pasang.cmd");
                File.WriteAllText(skrip,
                    "@echo off\r\n" +
                    ":tunggu\r\n" +
                    "tasklist /fi \"PID eq " + pid + "\" | find \"" + pid + "\" >nul && (ping -n 2 127.0.0.1 >nul & goto tunggu)\r\n" +
                    "robocopy \"" + sumber + "\" \"" + tujuan + "\" /E /R:5 /W:1 /NFL /NDL /NJH /NJS >nul\r\n" +
                    "start \"\" \"" + tujuan + "\\Orulabs Studio Recording.exe\" --setelah-update\r\n", Encoding.Default);
                var psi = new ProcessStartInfo("cmd.exe", "/c \"" + skrip + "\"") { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden };
                Process.Start(psi);
                return "{\"ok\":true,\"versi\":" + J(versiBaru) + "}";
            }
            catch (Exception ex)
            {
                return "{\"ok\":false,\"galat\":" + J("Update gagal: " + ex.Message) + "}";
            }
        }

        /// <summary>Hapus sisa file update lama (dipanggil saat aplikasi mulai).</summary>
        public static void BersihkanSisa()
        {
            try { if (Directory.Exists(FolderSementara)) Directory.Delete(FolderSementara, true); } catch { }
        }
    }
}
