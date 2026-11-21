// Rekam suara yang sedang keluar dari speaker bawaan Windows (WASAPI loopback), tanpa pustaka tambahan.
// Dipakai untuk "rekam 2 jalur": musik YouTube direkam langsung dari laptop (digital, jernih),
// terpisah dari vokal yang masuk lewat mic/mixer, sehingga volume keduanya bisa diatur sesudah merekam.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace OrulabStudio
{
    [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        int Initialize(int shareMode, int streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
        int GetBufferSize(out int frames);
        int GetStreamLatency(out long latency);
        int GetCurrentPadding(out int padding);
        int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        int GetMixFormat(out IntPtr format);
        int GetDevicePeriod(out long def, out long min);
        int Start();
        int Stop();
        int Reset();
        int SetEventHandle(IntPtr h);
        int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    }
    [Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        int GetBuffer(out IntPtr data, out int frames, out int flags, out long devicePosition, out long qpcPosition);
        int ReleaseBuffer(int frames);
        int GetNextPacketSize(out int frames);
    }

    /// <summary>Perekam suara laptop (loopback speaker bawaan Windows). Satu sesi pada satu waktu.</summary>
    static class RekamSuaraLaptop
    {
        static readonly object kunci = new object();
        static Thread benang;
        static volatile bool jalan;
        static MemoryStream data;   // sampel mono 16-bit
        static int rate;
        static string galat;

        public static bool Aktif { get { return jalan; } }

        /// <summary>Mulai merekam. Mengembalikan pesan galat, atau null bila berhasil.</summary>
        public static string Mulai()
        {
            lock (kunci)
            {
                Berhenti();
                data = new MemoryStream(); rate = 0; galat = null;
                var siap = new ManualResetEvent(false);
                jalan = true;
                benang = new Thread(() => Putaran(siap)) { IsBackground = true, Name = "RekamSuaraLaptop" };
                benang.SetApartmentState(ApartmentState.MTA);
                benang.Start();
                siap.WaitOne(3000);
                if (galat != null) { jalan = false; return galat; }
                return null;
            }
        }

        /// <summary>Berhenti lalu kembalikan WAV mono 16-bit (atau null bila tidak ada data).</summary>
        public static byte[] Selesai()
        {
            lock (kunci)
            {
                Berhenti();
                if (data == null || rate == 0 || data.Length == 0) return null;
                byte[] pcm = data.ToArray(); data = null;
                var ms = new MemoryStream();
                var bw = new BinaryWriter(ms);
                bw.Write(new[] { 'R', 'I', 'F', 'F' }); bw.Write(36 + pcm.Length); bw.Write(new[] { 'W', 'A', 'V', 'E' });
                bw.Write(new[] { 'f', 'm', 't', ' ' }); bw.Write(16); bw.Write((short)1); bw.Write((short)1);
                bw.Write(rate); bw.Write(rate * 2); bw.Write((short)2); bw.Write((short)16);
                bw.Write(new[] { 'd', 'a', 't', 'a' }); bw.Write(pcm.Length); bw.Write(pcm); bw.Flush();
                return ms.ToArray();
            }
        }

        public static void Batal() { lock (kunci) { Berhenti(); data = null; } }

        static void Berhenti()
        {
            jalan = false;
            if (benang != null) { benang.Join(2000); benang = null; }
        }

        static void Putaran(ManualResetEvent siap)
        {
            IAudioClient klien = null;
            try
            {
                var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
                IMMDevice dev; if (en.GetDefaultAudioEndpoint(0, 0, out dev) != 0 || dev == null) throw new Exception("Speaker bawaan tidak ditemukan");
                Guid iidKlien = typeof(IAudioClient).GUID; object o;
                Marshal.ThrowExceptionForHR(dev.Activate(ref iidKlien, 23, IntPtr.Zero, out o));
                klien = (IAudioClient)o;
                IntPtr fmt; Marshal.ThrowExceptionForHR(klien.GetMixFormat(out fmt));
                short tag = Marshal.ReadInt16(fmt, 0), ch = Marshal.ReadInt16(fmt, 2), bits = Marshal.ReadInt16(fmt, 14);
                int sr = Marshal.ReadInt32(fmt, 4);
                bool apung = tag == 3;
                if (tag == unchecked((short)0xFFFE)) { var sub = new byte[16]; Marshal.Copy(fmt + 24, sub, 0, 16); apung = new Guid(sub) == new Guid("00000003-0000-0010-8000-00aa00389b71"); }
                // Bersama (shared) + LOOPBACK, penyangga 100 ms
                Marshal.ThrowExceptionForHR(klien.Initialize(0, 0x00020000, 1000000, 0, fmt, IntPtr.Zero));
                Marshal.FreeCoTaskMem(fmt);
                Guid iidTangkap = typeof(IAudioCaptureClient).GUID; object oc;
                Marshal.ThrowExceptionForHR(klien.GetService(ref iidTangkap, out oc));
                var tangkap = (IAudioCaptureClient)oc;
                rate = sr;
                Marshal.ThrowExceptionForHR(klien.Start());
                var jam = Stopwatch.StartNew();
                long tertulis = 0;
                siap.Set();
                var bw = new BinaryWriter(data);
                while (jalan)
                {
                    Thread.Sleep(10);
                    int paket; tangkap.GetNextPacketSize(out paket);
                    bool adaData = false;
                    while (paket > 0)
                    {
                        IntPtr p; int n, flag; long dp, qp;
                        if (tangkap.GetBuffer(out p, out n, out flag, out dp, out qp) != 0) break;
                        adaData = true;
                        bool senyap = (flag & 0x2) != 0;
                        int bpf = ch * bits / 8;
                        for (int i = 0; i < n; i++)
                        {
                            float v = 0;
                            if (!senyap)
                            {
                                for (int c = 0; c < ch; c++)
                                {
                                    IntPtr a = p + i * bpf + c * bits / 8;
                                    if (apung && bits == 32) v += BitConverter.ToSingle(BitConverter.GetBytes(Marshal.ReadInt32(a)), 0);
                                    else if (bits == 16) v += Marshal.ReadInt16(a) / 32768f;
                                    else if (bits == 32) v += Marshal.ReadInt32(a) / 2147483648f;
                                    else if (bits == 24) v += ((Marshal.ReadByte(a) | (Marshal.ReadByte(a + 1) << 8) | ((sbyte)Marshal.ReadByte(a + 2) << 16))) / 8388608f;
                                }
                                v /= ch;
                            }
                            int s = (int)Math.Round(Math.Max(-1f, Math.Min(1f, v)) * 32767f);
                            bw.Write((short)s);
                        }
                        tertulis += n;
                        tangkap.ReleaseBuffer(n);
                        tangkap.GetNextPacketSize(out paket);
                    }
                    // Windows tidak mengirim paket saat tidak ada suara: isi dengan sunyi supaya waktunya tetap pas.
                    long harus = (long)(jam.Elapsed.TotalSeconds * sr);
                    if (!adaData && tertulis < harus - sr / 10)
                    {
                        long kurang = harus - sr / 20 - tertulis;
                        for (long i = 0; i < kurang; i++) bw.Write((short)0);
                        tertulis += kurang;
                    }
                }
                bw.Flush();
                klien.Stop();
            }
            catch (Exception e) { galat = e.Message; siap.Set(); }
            finally { if (klien != null) Marshal.ReleaseComObject(klien); }
        }
    }
}
