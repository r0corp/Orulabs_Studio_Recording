// Volume input Windows lewat Core Audio API (tanpa pustaka tambahan).
// Dipakai untuk slider "Volume input" di Orulab Studio.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace OrulabStudio
{
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator { int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection c); }
    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection { int GetCount(out int n); int Item(int i, out IMMDevice d); }
    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
        int OpenPropertyStore(int access, out IPropertyStore ps); }
    [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore { int GetCount(out int n); int GetAt(int i, out PROPERTYKEY k); int GetValue(ref PROPERTYKEY k, out PROPVARIANT v); }
    [StructLayout(LayoutKind.Sequential)] struct PROPERTYKEY { public Guid fmtid; public int pid; }
    [StructLayout(LayoutKind.Explicit)] struct PROPVARIANT { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr p2; }
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume { int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p);
        int GetChannelCount(out int n); int SetMasterVolumeLevel(float db, ref Guid g); int SetMasterVolumeLevelScalar(float v, ref Guid g);
        int GetMasterVolumeLevel(out float db); int GetMasterVolumeLevelScalar(out float v);
        int SetChannelVolumeLevel(int c, float db, ref Guid g); int SetChannelVolumeLevelScalar(int c, float v, ref Guid g);
        int GetChannelVolumeLevel(int c, out float db); int GetChannelVolumeLevelScalar(int c, out float v);
        int SetMute(bool m, ref Guid g); int GetMute(out bool m); }
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCo { }

    static class VolumeInput
    {
        /// <summary>Nama semua perangkat rekam yang aktif.</summary>
        public static List<string> Daftar()
        {
            var r = new List<string>();
            try
            {
                var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
                IMMDeviceCollection col; en.EnumAudioEndpoints(1, 1, out col);
                int n; col.GetCount(out n);
                for (int i = 0; i < n; i++) { IMMDevice d; col.Item(i, out d); r.Add(Nama(d)); }
            }
            catch { }
            return r;
        }

        static string Nama(IMMDevice d)
        {
            IPropertyStore ps; d.OpenPropertyStore(0, out ps);
            var key = new PROPERTYKEY(); key.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); key.pid = 14;
            PROPVARIANT v; ps.GetValue(ref key, out v);
            return Marshal.PtrToStringUni(v.p) ?? "";
        }

        /// <summary>Cari kontrol volume perangkat rekam yang namanya cocok (nama dari browser bisa sedikit berbeda).</summary>
        static IAudioEndpointVolume Cari(string nama)
        {
            if (string.IsNullOrEmpty(nama)) return null;
            try
            {
                var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
                IMMDeviceCollection col; en.EnumAudioEndpoints(1, 1, out col);
                int n; col.GetCount(out n);
                for (int i = 0; i < n; i++)
                {
                    IMMDevice d; col.Item(i, out d);
                    string fn = Nama(d);
                    if (fn.Equals(nama, StringComparison.OrdinalIgnoreCase) || nama.IndexOf(fn, StringComparison.OrdinalIgnoreCase) >= 0
                        || fn.IndexOf(nama, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        Guid iid = typeof(IAudioEndpointVolume).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o);
                        return (IAudioEndpointVolume)o;
                    }
                }
            }
            catch { }
            return null;
        }

        /// <summary>Volume 0..100, atau -1 bila perangkat tidak ditemukan.</summary>
        public static int Ambil(string nama)
        {
            var ev = Cari(nama); if (ev == null) return -1;
            float s; ev.GetMasterVolumeLevelScalar(out s); return (int)Math.Round(s * 100);
        }

        public static bool Atur(string nama, int persen)
        {
            var ev = Cari(nama); if (ev == null) return false;
            Guid g = Guid.Empty; ev.SetMute(false, ref g);
            ev.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, persen)) / 100f, ref g);
            return true;
        }
    }
}
