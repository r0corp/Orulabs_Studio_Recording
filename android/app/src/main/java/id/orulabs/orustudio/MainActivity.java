package id.orulabs.orustudio;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

/**
 * Oru Studio: tampilan web (sama dengan versi laptop untuk olah suara) di WebView,
 * dilayani server lokal 127.0.0.1. YouTube diputar di dalam halaman, iklannya diblokir.
 */
public class MainActivity extends Activity {
    private static final int REQ_IZIN = 1, REQ_PROYEKSI = 2;
    private static final int LATAR = 0xFF121624;
    private static WeakReference<MainActivity> kini = new WeakReference<>(null);
    private static Server server;

    private WebView web;
    private AudioManager am;
    private String jsIklan = "";
    private String namaTunda;
    private final Handler h = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        kini = new WeakReference<>(this);
        getWindow().setStatusBarColor(LATAR);
        getWindow().setNavigationBarColor(LATAR);
        am = getSystemService(AudioManager.class);
        jsIklan = bacaAset("app/iklan.js");
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        if (server == null) { server = new Server(this); server.mulai(); }
        web = new WebView(this);
        web.setBackgroundColor(LATAR);
        setContentView(web);
        siapkanWeb();
        mintaIzin();
    }

    @SuppressWarnings("SetJavaScriptEnabled")
    private void siapkanWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Jembatan(), "Oru");
        boolean awal = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (awal) WebViewCompat.addDocumentStartJavaScript(web, jsIklan, Collections.singleton("*"));
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (IklanBlok.blokir(r.getUrl()))
                    return new WebResourceResponse("text/plain", "utf-8", 204, "No Content", null, new ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                // tautan keluar (mis. logo YouTube) dibuka di browser, bukan menggantikan aplikasi
                if (!r.isForMainFrame()) return false;
                String host = r.getUrl().getHost();
                if ("127.0.0.1".equals(host)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception ignored) {}
                return true;
            }
            @Override
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap f) {
                if (!awal) v.evaluateJavascript(jsIklan, null);
            }
        });
        // server butuh sebentar untuk siap
        h.postDelayed(() -> web.loadUrl("http://127.0.0.1:" + Server.PORT + "/app/index.html"), 150);
    }

    /** Dipanggil dari tampilan (window.Oru.*). Semua pemanggilan datang dari thread JavaBridge. */
    private class Jembatan {
        @JavascriptInterface public void iklan(boolean tampil) {
            if (tampil) IklanBlok.terlihat.incrementAndGet();
            RekamService.iklanTampil = tampil && RekamService.aktif;
        }
        @JavascriptInterface public void mulaiRekam() { h.post(MainActivity.this::mintaProyeksi); }
        @JavascriptInterface public void stopRekam(String nama) {
            h.post(() -> startService(new Intent(MainActivity.this, RekamService.class).setAction("STOP").putExtra("nama", nama)));
        }
        @JavascriptInterface public String status() {
            long d = RekamService.aktif ? System.currentTimeMillis() - RekamService.mulaiMs : 0;
            return "{\"aktif\":" + RekamService.aktif + ",\"menyimpan\":" + RekamService.menyimpan + ",\"ms\":" + d
                    + ",\"detik\":" + String.format(Locale.US, "%.2f", RekamService.sampelTertulis / (double) RekamService.RATE)
                    + ",\"mic\":" + String.format(Locale.US, "%.1f", RekamService.dbMic)
                    + ",\"musik\":" + String.format(Locale.US, "%.1f", RekamService.dbMusik)
                    + ",\"adaMusik\":" + RekamService.adaMusik
                    + ",\"iklan\":" + RekamService.iklanTampil
                    + ",\"diblokir\":" + IklanBlok.diblokir.get()
                    + ",\"nama\":" + Server.J(RekamService.hasilNama) + ",\"galat\":" + Server.J(RekamService.galat) + "}";
        }
        @JavascriptInterface public int volume() { return am.getStreamVolume(AudioManager.STREAM_MUSIC); }
        @JavascriptInterface public int volumeMaks() { return am.getStreamMaxVolume(AudioManager.STREAM_MUSIC); }
        @JavascriptInterface public void aturVolume(int v) { am.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0); }
        @JavascriptInterface public void layarNyala(boolean nyala) {
            h.post(() -> {
                if (nyala) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
        @JavascriptInterface public String folder() { return Server.folderRekaman().getAbsolutePath(); }
    }

    private void mintaIzin() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS}, REQ_IZIN);
    }

    private void mintaProyeksi() {
        if (RekamService.aktif) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            mintaIzin();
            kabari("rekamGagal", "Izinkan mikrofon dulu, lalu tekan rekam lagi.");
            return;
        }
        if (RekamService.proyeksiSiap) { // izin sudah diberikan di sesi ini: langsung rekam
            startForegroundService(new Intent(this, RekamService.class).setAction("REKAM"));
            kabari("rekamMulai", "");
            return;
        }
        MediaProjectionManager mpm = getSystemService(MediaProjectionManager.class);
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_PROYEKSI);
    }

    @Override
    protected void onActivityResult(int req, int kode, Intent data) {
        super.onActivityResult(req, kode, data);
        if (req != REQ_PROYEKSI) return;
        if (kode != RESULT_OK || data == null) {
            // tanpa izin: tetap rekam vokal saja (musik hanya lewat speaker)
            kabari("rekamTanpaMusik", "");
            startForegroundService(new Intent(this, RekamService.class));
        } else {
            startForegroundService(new Intent(this, RekamService.class).putExtra("kode", kode).putExtra("data", data));
        }
        kabari("rekamMulai", "");
    }

    private void kabari(String jenis, String pesan) {
        web.evaluateJavascript("window.dariAndroid && window.dariAndroid(" + Server.J(jenis) + "," + Server.J(pesan) + ")", null);
    }

    /** Buka jendela Bagikan Android untuk file M4A (WhatsApp, dsb.). */
    static void bagikan(Uri uri, String judul) {
        MainActivity a = kini.get();
        if (a == null || uri == null) return;
        a.h.post(() -> {
            Intent i = new Intent(Intent.ACTION_SEND).setType("audio/mp4").putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            a.startActivity(Intent.createChooser(i, judul));
        });
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.tombolKembali ? window.tombolKembali() : false", v -> {
            if (!"true".equals(v)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        if (isFinishing()) {
            if (RekamService.aktif) startService(new Intent(this, RekamService.class).setAction("STOP").putExtra("nama", "Rekaman " + System.currentTimeMillis()));
            else startService(new Intent(this, RekamService.class).setAction("MATI"));
        }
        web.destroy();
        super.onDestroy();
    }

    private String bacaAset(String nama) {
        try (InputStream in = getAssets().open(nama)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        }
    }

    @SuppressWarnings("unused")
    private static void abaikan(View v) {}
}
