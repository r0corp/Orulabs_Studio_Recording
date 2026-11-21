package id.orulabs.orustudio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Rekam 2 jalur: vokal dari mic HP (mono) dan musik dari suara aplikasi (stereo, digital, tidak terpengaruh volume speaker).
 * Disimpan sebagai "Music/Oru Studio/<nama>.wav" dan "Music/Oru Studio/Jalur musik/<nama>.wav".
 * Selama iklan YouTube tampil, kedua jalur ditahan bersamaan supaya iklan tidak ikut terekam dan jalur tetap sejajar.
 */
public class RekamService extends Service {
    static final String TAG = "OruRekam";
    static final int RATE = 48000;

    static volatile boolean aktif, menyimpan;
    static volatile boolean iklanTampil;
    static volatile double dbMic = -99, dbMusik = -99;
    static volatile long mulaiMs;
    static volatile long sampelTertulis;
    static volatile String hasilNama = "", galat = "";
    static volatile boolean adaMusik;
    /** Izin rekam suara HP (MediaProjection) disimpan selama aplikasi terbuka, jadi cukup diminta sekali. */
    static volatile boolean proyeksiSiap;

    private MediaProjection proyeksi;
    private AudioRecord arMic, arMusik;
    private Thread tMic, tMusik;
    private volatile boolean jalan;
    private File rawMic, rawMusik;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String aksi = intent == null ? null : intent.getAction();
        if ("STOP".equals(aksi)) {
            String nama = intent.getStringExtra("nama");
            new Thread(() -> berhenti(nama), "simpan").start();
            return START_NOT_STICKY;
        }
        if ("MATI".equals(aksi)) {
            if (!aktif) { lepasProyeksi(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); }
            return START_NOT_STICKY;
        }
        if (aktif || intent == null) return START_NOT_STICKY;
        hasilNama = ""; galat = "";
        try {
            Intent data = intent.getParcelableExtra("data");
            if (data != null) {
                lepasProyeksi();
                tampilNotif(true, "Sedang merekam");
                MediaProjectionManager mpm = getSystemService(MediaProjectionManager.class);
                proyeksi = mpm.getMediaProjection(intent.getIntExtra("kode", 0), data);
                proyeksi.registerCallback(new MediaProjection.Callback() {
                    @Override public void onStop() {
                        Log.i(TAG, "proyeksi berhenti");
                        proyeksi = null; proyeksiSiap = false;
                        if (!aktif) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); }
                    }
                }, new Handler(Looper.getMainLooper()));
                proyeksiSiap = true;
            } else tampilNotif(proyeksi != null, "Sedang merekam"); // "REKAM": pakai izin yang sudah ada
            mulaiRekam();
        } catch (Exception e) {
            Log.e(TAG, "gagal mulai", e);
            galat = "Gagal mulai merekam: " + e.getMessage();
            lepasRekaman();
            if (proyeksi == null) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); }
        }
        return START_NOT_STICKY;
    }

    private void tampilNotif(boolean proyeksiAda, String teks) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("rekam", "Merekam", NotificationManager.IMPORTANCE_LOW));
        PendingIntent buka = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "rekam")
                .setContentTitle("Oru Studio")
                .setContentText(teks)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentIntent(buka)
                .setOngoing(true)
                .build();
        int tipe = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        if (proyeksiAda) tipe |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
        startForeground(1, n, tipe);
    }

    @SuppressWarnings("MissingPermission")
    private void mulaiRekam() throws IOException {
        AudioManager am = getSystemService(AudioManager.class);
        boolean unprocessed = "true".equals(am.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED));
        int sumber = unprocessed ? MediaRecorder.AudioSource.UNPROCESSED : MediaRecorder.AudioSource.VOICE_RECOGNITION;

        AudioFormat fMono = new AudioFormat.Builder().setSampleRate(RATE)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build();
        int bMono = Math.max(AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT) * 4, RATE / 5 * 2);
        arMic = new AudioRecord.Builder().setAudioSource(sumber).setAudioFormat(fMono).setBufferSizeInBytes(bMono).build();
        if (arMic.getState() != AudioRecord.STATE_INITIALIZED) throw new IOException("mic tidak siap");

        adaMusik = false;
        if (proyeksi != null) {
            AudioFormat fStereo = new AudioFormat.Builder().setSampleRate(RATE)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_IN_STEREO).build();
            AudioPlaybackCaptureConfiguration cfg = new AudioPlaybackCaptureConfiguration.Builder(proyeksi)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                    .build();
            arMusik = new AudioRecord.Builder().setAudioFormat(fStereo).setBufferSizeInBytes(bMono * 2)
                    .setAudioPlaybackCaptureConfig(cfg).build();
            adaMusik = arMusik.getState() == AudioRecord.STATE_INITIALIZED;
            if (!adaMusik) { arMusik.release(); arMusik = null; }
        }

        File dir = new File(getCacheDir(), "rekam");
        dir.mkdirs();
        rawMic = new File(dir, "vokal.raw");
        rawMusik = new File(dir, "musik.raw");
        rawMusik.delete();

        jalan = true;
        iklanTampil = false;
        sampelTertulis = 0;
        arMic.startRecording();
        if (arMusik != null) arMusik.startRecording();
        mulaiMs = System.currentTimeMillis();
        aktif = true;
        tMic = baca(arMic, rawMic, bMono, true);
        if (arMusik != null) tMusik = baca(arMusik, rawMusik, bMono * 2, false);
        Log.i(TAG, "mulai rekam, mic=" + (unprocessed ? "UNPROCESSED" : "VOICE_RECOGNITION") + ", musik=" + adaMusik);
    }

    private Thread baca(AudioRecord ar, File f, int ukuran, boolean mic) {
        Thread t = new Thread(() -> {
            byte[] buf = new byte[ukuran / 2];
            try (FileOutputStream out = new FileOutputStream(f)) {
                while (jalan) {
                    int n = ar.read(buf, 0, buf.length);
                    if (n <= 0) continue;
                    double jum = 0;
                    for (int i = 0; i + 1 < n; i += 2) {
                        double s = (short) ((buf[i] & 0xff) | (buf[i + 1] << 8)) / 32768.0;
                        jum += s * s;
                    }
                    double db = 10 * Math.log10(Math.max(jum / Math.max(1, n / 2), 1e-10));
                    if (mic) dbMic = db; else dbMusik = db;
                    if (iklanTampil) continue;
                    out.write(buf, 0, n);
                    if (mic) sampelTertulis += n / 2;
                }
            } catch (IOException e) {
                Log.e(TAG, "tulis gagal", e);
                galat = "Tulis gagal: " + e.getMessage();
            }
        }, mic ? "rekam-vokal" : "rekam-musik");
        t.start();
        return t;
    }

    /** nama kosong = batal (rekaman dibuang). */
    private void berhenti(String nama) {
        if (!aktif) { stopSelf(); return; }
        menyimpan = true;
        jalan = false;
        try { if (tMic != null) tMic.join(3000); if (tMusik != null) tMusik.join(3000); } catch (InterruptedException ignored) {}
        lepasRekaman();
        aktif = false;
        try {
            if (nama != null && !nama.isEmpty()) {
                Server.folderRekaman().mkdirs();
                String n = Server.namaUnik(Server.bersihkan(nama));
                File v = new File(Server.folderRekaman(), n + ".wav");
                simpanWav(rawMic, v, 1);
                if (adaMusik && rawMusik.length() > 0) {
                    Server.folderMusik().mkdirs();
                    simpanWav(rawMusik, new File(Server.folderMusik(), n + ".wav"), 2);
                }
                hasilNama = n;
            }
        } catch (IOException e) {
            Log.e(TAG, "simpan gagal", e);
            galat = "Gagal menyimpan: " + e.getMessage();
        } finally {
            rawMic.delete(); rawMusik.delete();
            menyimpan = false;
            if (proyeksi != null) tampilNotif(true, "Siap merekam");
            else { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); }
        }
    }

    private void lepasRekaman() {
        for (AudioRecord ar : new AudioRecord[]{arMic, arMusik}) {
            if (ar == null) continue;
            try { ar.stop(); } catch (Exception ignored) {}
            ar.release();
        }
        arMic = arMusik = null;
    }
    private void lepasProyeksi() {
        proyeksiSiap = false;
        if (proyeksi != null) { MediaProjection p = proyeksi; proyeksi = null; p.stop(); }
    }
    @Override public void onDestroy() { lepasRekaman(); lepasProyeksi(); super.onDestroy(); }

    private static void simpanWav(File raw, File tujuan, int kanal) throws IOException {
        long data = raw.length();
        try (OutputStream out = new FileOutputStream(tujuan); InputStream in = new FileInputStream(raw)) {
            out.write(kepalaWav(data, kanal));
            byte[] b = new byte[65536];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
        }
    }

    private static byte[] kepalaWav(long data, int kanal) {
        byte[] h = new byte[44];
        int br = RATE * kanal * 2;
        tulis(h, 0, "RIFF"); le(h, 4, (int) (36 + data)); tulis(h, 8, "WAVE"); tulis(h, 12, "fmt ");
        le(h, 16, 16); h[20] = 1; h[22] = (byte) kanal; le(h, 24, RATE); le(h, 28, br);
        h[32] = (byte) (kanal * 2); h[34] = 16; tulis(h, 36, "data"); le(h, 40, (int) data);
        return h;
    }
    private static void tulis(byte[] h, int o, String s) { for (int i = 0; i < 4; i++) h[o + i] = (byte) s.charAt(i); }
    private static void le(byte[] h, int o, int v) { for (int i = 0; i < 4; i++) h[o + i] = (byte) (v >> (8 * i)); }
}
