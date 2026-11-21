# Tes

Dua jenis tes, keduanya memakai data buatan dan **tidak menyentuh rekaman atau setelan pengguna**.

| Tes | Isi | Cara menjalankan |
|---|---|---|
| `unit.mjs` | Mesin suara tanpa browser: WAV mono/stereo, kalibrasi sinkron, lacak & koreksi nada (Magic Vocal), peredam pegangan mic, campur 2 jalur stereo, ringkasan level | `node tests/unit.mjs` |
| `e2e.mjs` | Aplikasi hasil build dijalankan di port 47899 dengan folder data sementara (`--data`), dibuka di Chrome tanpa jendela dengan mic palsu: merekam, Mix Studio, Magic Vocal, Potong, Pengaturan, bahasa | `.\build.ps1` lalu `node tests/e2e.mjs` |

Catatan:

- `e2e.mjs` membuka halaman dengan `?tes=1`, sehingga aplikasi **tidak mengubah perangkat audio bawaan Windows**.
- Tes keluar dengan kode 1 bila ada yang gagal, jadi bisa dipakai sebelum rilis:
  `node tests/unit.mjs && .\build.ps1 && node tests/e2e.mjs`
