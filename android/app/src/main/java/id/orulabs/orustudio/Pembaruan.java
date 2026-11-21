package id.orulabs.orustudio;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Update otomatis dari GitHub Releases: rilis yang berisi file "Oru-Studio-<versi>.apk".
 * APK diunduh lalu penginstal Android dibuka (pengguna menekan "Update").
 */
final class Pembaruan {
    private static final String RILIS = "https://api.github.com/repos/r0corp/Orulabs_Studio_Recording/releases?per_page=20";
    private static volatile String urlApk, versiBaru;

    static String cek() {
        try {
            JSONArray rilis = new JSONArray(Server.unduh(RILIS));
            for (int i = 0; i < rilis.length(); i++) {
                JSONObject r = rilis.getJSONObject(i);
                if (r.optBoolean("draft")) continue;
                JSONArray aset = r.optJSONArray("assets");
                if (aset == null) continue;
                for (int k = 0; k < aset.length(); k++) {
                    JSONObject a = aset.getJSONObject(k);
                    String n = a.optString("name");
                    if (!n.startsWith("Oru-Studio-") || !n.endsWith(".apk")) continue;
                    String v = n.substring("Oru-Studio-".length(), n.length() - 4);
                    urlApk = a.optString("browser_download_url"); versiBaru = v;
                    boolean ada = lebihBaru(v, BuildConfig.VERSION_NAME);
                    return "{\"versi\":" + Server.J(BuildConfig.VERSION_NAME) + ",\"terbaru\":" + Server.J(v) + ",\"ada\":" + ada
                            + ",\"judul\":" + Server.J(r.optString("name")) + ",\"catatan\":" + Server.J(r.optString("body")) + "}";
                }
            }
            return "{\"versi\":" + Server.J(BuildConfig.VERSION_NAME) + ",\"ada\":false}";
        } catch (Exception e) {
            return "{\"versi\":" + Server.J(BuildConfig.VERSION_NAME) + ",\"ada\":false,\"galat\":" + Server.J(e.getMessage()) + "}";
        }
    }

    static String pasang(Context ctx) {
        try {
            if (urlApk == null) cek();
            if (urlApk == null) return "{\"ok\":false,\"galat\":\"Tidak ada pembaruan\"}";
            File dir = new File(ctx.getCacheDir(), "update"); dir.mkdirs();
            File f = new File(dir, "Oru-Studio-" + versiBaru + ".apk");
            HttpURLConnection c = (HttpURLConnection) new URL(urlApk).openConnection();
            c.setInstanceFollowRedirects(true);
            try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
            }
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".berkas", f);
            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            return "{\"ok\":true,\"versi\":" + Server.J(versiBaru) + "}";
        } catch (Exception e) {
            return "{\"ok\":false,\"galat\":" + Server.J(e.getMessage()) + "}";
        }
    }

    /** "0.2.1" > "0.2"? */
    static boolean lebihBaru(String a, String b) {
        String[] x = a.split("[.-]"), y = b.split("[.-]");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? angka(x[i]) : 0, q = i < y.length ? angka(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }
    private static int angka(String s) { try { return Integer.parseInt(s.replaceAll("\\D", "")); } catch (Exception e) { return 0; } }

    private Pembaruan() {}
}
