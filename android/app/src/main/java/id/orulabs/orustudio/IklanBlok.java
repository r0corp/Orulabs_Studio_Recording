package id.orulabs.orustudio;

import android.net.Uri;

import java.util.concurrent.atomic.AtomicInteger;

/** Daftar alamat iklan YouTube/Google yang tidak diteruskan WebView. */
final class IklanBlok {
    static final AtomicInteger diblokir = new AtomicInteger();
    static final AtomicInteger terlihat = new AtomicInteger();

    private static final String[] HOST = {
            "doubleclick.net", "googlesyndication.com", "googleadservices.com",
            "googletagservices.com", "adservice.google.com", "imasdk.googleapis.com"
    };
    private static final String[] JALUR = {
            "/pagead/", "/api/stats/ads", "/ptracking", "/get_midroll", "/pcs/activeview"
    };

    static boolean blokir(Uri u) {
        String h = u.getHost();
        if (h == null) return false;
        for (String x : HOST) if (h.equals(x) || h.endsWith("." + x)) return hitung();
        String p = u.getPath();
        if (p != null && (h.endsWith("youtube.com") || h.endsWith("google.com")))
            for (String x : JALUR) if (p.contains(x)) return hitung();
        return false;
    }

    private static boolean hitung() {
        diblokir.incrementAndGet();
        return true;
    }

    private IklanBlok() {}
}
