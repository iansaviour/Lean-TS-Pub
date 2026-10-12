# Counter DApp

Halaman web untuk satu kontrak counter di TON testnet. Kontraknya sudah hidup di `kQC1eFvsm30A-6IiEblGiJpet0O-r1YZa8A1w6nCyeYXY_u0`. Kode di repo ini hanya bagian depan: membaca data kontrak, lalu meminta wallet mengirim transaksi.

Aplikasi ada di folder `dapp/`.

## Menjalankan

```powershell
cd dapp
npm ci
npm run dev
```

`npm run build` memeriksa TypeScript lalu membangun situs statis ke `dapp/dist`.

## Tampilan

`dapp/index.html` menyusun halaman. Tombol koneksi wallet masuk ke `#ton-connect`. Angka counter, saldo, pengirim terakhir, dan pemilik punya id masing-masing. `dapp/src/main.ts` mencari elemen itu dan mengisinya.

## Dua jalur ke blockchain

Membaca dan menulis lewat jalur yang berbeda.

Membaca memakai `TonClient` ke `https://testnet.toncenter.com/api/v2/jsonRPC`. Ini panggilan HTTP biasa, jadi tidak perlu wallet. `client()` membuat koneksi itu sekali, lalu memakainya lagi. Tanpa API key, TON Center mengizinkan sekitar satu permintaan per detik. Halaman membaca dua kali setiap 12 detik.

Menulis memakai TonConnect. Tombol koneksi muncul di `#ton-connect`. `dapp/public/tonconnect-manifest.json` memberitahu wallet nama aplikasi dan ikonnya. `setConnectionNetwork("-3")` meminta jaringan testnet. Di TON, `-3` adalah testnet dan `-239` adalah mainnet.

## Membaca data

`refresh()` memanggil dua getter di kontrak:

1. `get_contract_storage_data` mengembalikan tiga nilai berurutan: angka counter, alamat pengirim terakhir, lalu alamat pemilik. Pemilik disimpan di variabel `owner`.
2. `balance` mengembalikan saldo kontrak dalam nanoton. `formatTon()` membaginya dengan `1_000_000_000` supaya tampil sebagai TON.

Fungsi ini dipanggil saat halaman dibuka, lalu diulang setiap 12 detik.

## Tiga tombol

Semua aksi lewat `send()`. Fungsi itu menolak jika wallet belum terhubung atau bukan testnet, lalu memanggil `sendTransaction`. Isi pesannya adalah sebuah cell yang diubah menjadi base64.

| Tombol | Isi pesan | TON yang dikirim |
| --- | --- | --- |
| Tambah +1 | opcode `1`, lalu angka `1` | 0,05 TON untuk gas |
| Setor | opcode `2` | jumlah di kolom, misalnya 0,1 TON |
| Tarik | opcode `3`, lalu jumlah yang ditarik | 0,05 TON untuk gas |

Opcode adalah angka 32-bit pertama di pesan. Kontrak memakai angka itu untuk membedakan perintah. `toNano("0.05")` mengubah `"0.05"` menjadi `50000000` nanoton, karena transaksi TON memakai bilangan bulat.

Permintaan transaksi berlaku 300 detik. Setelah wallet menyetujui, halaman menunggu 8 detik, lalu membaca kontrak lagi.

## Tombol yang dikunci

`syncButtons()` mengunci Tambah dan Setor sampai wallet testnet terhubung. Tombol Tarik hanya aktif jika alamat wallet sama dengan `owner` yang baru dibaca dari kontrak. Sampai pembacaan pertama selesai, `owner` masih `null`, jadi Tarik tetap terkunci.

## Contoh alur

### 1. Halaman dibuka

Belum ada wallet. `syncButtons()` melihat `connectedWallet()` kosong, jadi Tambah, Setor, dan Tarik terkunci. Teksnya tetap "Wallet belum terhubung".

`refresh()` langsung berjalan. Kontrak menjawab getter `get_contract_storage_data`:

- counter: `7`
- pengirim terakhir: `0QC3ab…9kLm`
- pemilik: `0QAa91…kP2s`

Getter `balance` menjawab `250000000` nanoton. `formatTon()` menampilkannya sebagai `0.25 TON`. Angka `7` masuk ke layar. `owner` sekarang `0QAa91…kP2s`, tetapi Tarik masih terkunci karena wallet belum terhubung.

### 2. Wallet terhubung

Pengguna menekan tombol TonConnect dan menyetujui di Tonkeeper yang sedang di testnet. `onStatusChange` menerima akun dengan `chain` sama dengan `"-3"`. Baris wallet berubah menjadi `0QBb12…8nQx · Testnet`.

`syncButtons()` membuka Tambah dan Setor. Alamat wallet ini bukan pemilik, jadi Tarik tetap terkunci.

### 3. Tambah +1

Pesan yang dibangun:

```ts
beginCell().storeUint(1, 32).storeUint(1, 32)
```

Artinya opcode `1`, lalu nilai `1`. `send()` mengirim pesan itu ke kontrak bersama `0.05` TON. Status berubah menjadi "Menunggu konfirmasi di wallet…". Setelah disetujui, pesan yang terkirim berisi:

- tujuan: `kQC1eFvsm30A-6IiEblGiJpet0O-r1YZa8A1w6nCyeYXY_u0`
- jumlah: `50000000` nanoton
- payload: cell di atas, dalam bentuk base64

Delapan detik kemudian `refresh()` berjalan lagi. Layar menunjukkan `8`, dan pengirim terakhir menjadi alamat wallet tersebut. Pembacaan biasa setiap 12 detik juga menangkap perubahan yang sama.

### 4. Setor 0,1 TON

Kolom setor berisi `0.1`. Pesannya hanya opcode `2`:

```ts
beginCell().storeUint(2, 32)
```

TON yang menempel pada pesan adalah `toNano("0.1")`, yaitu `100000000` nanoton. Setelah transaksi masuk, saldo kontrak naik sekitar `0.1` TON.

### 5. Tarik, hanya pemilik

Wallet `0QBb12…8nQx` tidak bisa menekan Tarik karena tombolnya mati. Setelah wallet pemilik `0QAa91…kP2s` terhubung, `syncButtons()` membuka Tarik.

Kolom tarik berisi `0.05`. Pesannya:

```ts
beginCell().storeUint(3, 32).storeCoins(amount)
```

Opcode-nya `3`, diikuti `0.05` TON yang diminta. Gas yang dikirim tetap `0.05` TON. Kontrak mengirim `0.05` TON saldo ke pemilik, lalu `refresh()` menampilkan saldo yang sudah berkurang.

## Deploy

Situs dipublikasikan ke GitHub Pages di `https://iansaviour.github.io/Lean-TS-Pub/`.

`dapp/vite.config.ts` memakai `base: "/Lean-TS-Pub/"`. Manifest TonConnect memakai URL yang sama. Workflow `.github/workflows/pages.yml` membangun `dapp` pada push ke `main` dan men-deploy `dapp/dist`. Di pengaturan repo, sumber Pages harus **GitHub Actions**.
