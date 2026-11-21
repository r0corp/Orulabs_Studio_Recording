package id.orulabs.orustudio;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;

/** WAV 16-bit (mono/stereo) → M4A (AAC-LC) dengan encoder bawaan Android, untuk WhatsApp. */
final class KeM4a {
    static void ubah(byte[] wav, File tujuan) throws IOException {
        if (wav.length < 44 || wav[0] != 'R' || wav[1] != 'I' || wav[2] != 'F' || wav[3] != 'F') throw new IOException("Bukan file WAV");
        int kanal = 0, rate = 0, bit = 0, mulai = -1, panjang = 0, pos = 12;
        while (pos + 8 <= wav.length) {
            String id = new String(wav, pos, 4, java.nio.charset.StandardCharsets.US_ASCII);
            int size = le32(wav, pos + 4);
            if (id.equals("fmt ")) { kanal = le16(wav, pos + 10); rate = le32(wav, pos + 12); bit = le16(wav, pos + 22); }
            if (id.equals("data")) { mulai = pos + 8; panjang = Math.min(size, wav.length - mulai); break; }
            pos += 8 + size + (size & 1);
        }
        if (mulai < 0 || bit != 16 || kanal < 1 || kanal > 2) throw new IOException("Format WAV tidak didukung");
        int akhir = mulai + panjang, blok = 2 * kanal;

        MediaFormat f = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, rate, kanal);
        f.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        f.setInteger(MediaFormat.KEY_BIT_RATE, kanal == 2 ? 256000 : 192000);
        f.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384 * kanal);
        MediaCodec c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
        c.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        c.start();
        if (tujuan.exists()) tujuan.delete();
        MediaMuxer m = new MediaMuxer(tujuan.getPath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        int jalur = -1, p = mulai;
        long bingkai = 0;
        boolean masukSelesai = false, muxJalan = false;
        try {
            while (true) {
                if (!masukSelesai) {
                    int i = c.dequeueInputBuffer(10000);
                    if (i >= 0) {
                        ByteBuffer b = c.getInputBuffer(i);
                        b.clear();
                        int n = Math.min(b.remaining(), akhir - p);
                        n -= n % blok;
                        long pts = bingkai * 1_000_000L / rate;
                        if (n <= 0) { c.queueInputBuffer(i, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM); masukSelesai = true; }
                        else { b.put(wav, p, n); p += n; bingkai += n / blok; c.queueInputBuffer(i, 0, n, pts, 0); }
                    }
                }
                int o = c.dequeueOutputBuffer(info, 10000);
                if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) { jalur = m.addTrack(c.getOutputFormat()); m.start(); muxJalan = true; }
                else if (o >= 0) {
                    ByteBuffer ob = c.getOutputBuffer(o);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0;
                    if (info.size > 0 && muxJalan) { ob.position(info.offset); ob.limit(info.offset + info.size); m.writeSampleData(jalur, ob, info); }
                    c.releaseOutputBuffer(o, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break;
                }
            }
        } finally {
            try { c.stop(); } catch (Exception ignored) {}
            c.release();
            try { if (muxJalan) m.stop(); } catch (Exception ignored) {}
            m.release();
        }
    }

    private static int le16(byte[] b, int o) { return (b[o] & 0xff) | (b[o + 1] & 0xff) << 8; }
    private static int le32(byte[] b, int o) { return (b[o] & 0xff) | (b[o + 1] & 0xff) << 8 | (b[o + 2] & 0xff) << 16 | (b[o + 3] & 0xff) << 24; }

    private KeM4a() {}
}
