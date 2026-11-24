# Survei TON (dashboard)

Halaman web untuk kontrak survei di `Learn-TS-TON/survey_dapp`. Satu kontrak master (SurveyDApp) men-deploy satu kontrak Survey untuk setiap survei. Halaman ini membaca semuanya lewat TON Center, lalu meminta wallet mengirim transaksi lewat TonConnect.

Online: `https://iansaviour.github.io/Lean-TS-Pub/survey/`

## Menjalankan

```powershell
npm ci
npm run dev
```

Vite 8 butuh Node 22.12 atau lebih baru. Di Node yang lebih lama, `npm ci` melewati paket native `@rolldown/binding-*` dan `@oxlint/binding-*`, lalu `npm run build` gagal mencari modul itu.

## Alamat kontrak

Deploy master dari `Learn-TS-TON/survey_dapp`:

```powershell
npx blueprint run deploySurveyDApp --testnet
```

Lalu isi alamatnya di `CONTRACT_ADDRESS` pada `src/config.ts`. Selama masih kosong, halaman hanya menampilkan pesan untuk mengisinya.

## File

| File | Isi |
| --- | --- |
| `src/survey.ts` | Format cell kontrak: membaca data master dan survei, membangun pesan buat, jawab, dan tutup. Harus sama dengan `contracts/imports/survey_common.fc` dan `wrappers/` di `survey_dapp`. |
| `src/contract.ts` | Membaca akun dari TON Center v3 dalam satu permintaan, lalu format TON dan alamat. |
| `src/SurveyApp.tsx` | Layout, routing hash (`#/`, `#/buat`, `#/survei`, `#/survei/{id}`), wallet, dan pengiriman transaksi. |
| `src/CreateSurvey.tsx` | Form buat survei. |
| `src/SurveyCard.tsx` | Kartu survei, form jawaban, dan hasil. |
| `src/messages.ts` | Teks Indonesia dan Inggris. |

## Jenis pertanyaan

- **Pilihan**: 2 sampai 5 opsi. Centang "Boleh pilih lebih dari satu" lalu isi jumlah maksimal untuk pilihan ganda. Jawaban dikirim sebagai bitmask 8-bit, misalnya opsi 0 dan 2 menjadi `0b101`.
- **Isian teks**: batas 1 sampai 200 karakter. Kalau "Hanya huruf, angka, spasi, dan tanda baca" dicentang, kontrak menolak emoji, huruf beraksen, dan simbol lain. Form mengubah ’ “ ” … otomatis menjadi ' " ... supaya tidak ditolak.
- **Wajib dijawab**: kalau tidak dicentang, pertanyaan boleh dilewati (minimal 0 pilihan atau 0 karakter).

Hasil pilihan dan semua jawaban teks terlihat setelah wallet menjawab, setelah survei ditutup, atau oleh pembuatnya. Persentase pilihan dihitung dari jumlah responden, jadi pada pilihan ganda totalnya bisa lebih dari 100%.

## Biaya

| Aksi | TON yang dikirim |
| --- | --- |
| Buat survei | 0,05 + hadiah per responden × jumlah responden berhadiah |
| Jawab | mulai 0,05, bertambah sesuai panjang teks. 0,01 disimpan kontrak untuk biaya penyimpanan jawaban, sisanya kembali bersama hadiah. |
| Tutup | 0,05, kembali bersama sisa pool |
