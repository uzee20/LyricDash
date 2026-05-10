# LyricDash Arena

LyricDash Arena adalah MVP multiplayer untuk game mengetik berbasis sinkronisasi audio dan lirik. Versi ini memakai `Node.js + Socket.io` untuk komunikasi real-time antar pemain.

## Teknologi

- `Node.js` untuk server lokal
- `Socket.io` untuk room multiplayer, countdown, dan leaderboard live
- `HTML`, `CSS`, dan `JavaScript` untuk antarmuka dan gameplay
- `REST API` ringan untuk membuat dan join room
- `HTML5 Audio` untuk pemutaran lagu
- parser `LRC` buatan sendiri untuk sinkronisasi lirik

## Fitur

- Host membuat room dan mengunggah audio serta lirik
- Pemain lain masuk dengan kode room
- Countdown start sinkron untuk semua pemain
- Tampilan dipisah menjadi fase `Lobby`, `Match`, dan `Hasil`
- Pemenang ditampilkan setelah semua pemain selesai
- Skor, akurasi, dan progress dikirim ke server secara real-time

## Menjalankan

1. Pastikan `Node.js` sudah terpasang.
2. Install dependency:

```powershell
npm.cmd install
```

3. Jalankan server:

```powershell
npm.cmd start
```

4. Buka [http://localhost:3000](http://localhost:3000)
5. Host membuat room, lalu pemain lain join memakai kode room yang sama.


