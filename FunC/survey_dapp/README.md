# survey_dapp

Kontrak survei di TON. Versi terpisah dari `vote_dapp_set`: pertanyaan bisa berupa pilihan (boleh lebih dari satu) atau isian teks dengan batas karakter.

Dashboard-nya ada di repo `Lean-TS-Pub`, folder `dapp_survey`.

## Kontrak

- `contracts/survey_d_app.fc`: **SurveyDApp**, master/factory. Memvalidasi pertanyaan, lalu men-deploy satu kontrak Survey untuk setiap survei. Storage-nya tidak bertambah berapa pun jumlah survei.
- `contracts/survey.fc`: **Survey**, satu kontrak per survei. Menghitung suara pilihan, menyimpan setiap jawaban lengkap, membayar hadiah, dan menolak jawaban kedua dari wallet yang sama.
- `contracts/imports/survey_common.fc`: opcode, error, batas, dan layout storage.

### Jenis pertanyaan

| Jenis | Pengaturan | Batas |
| --- | --- | --- |
| Pilihan | `minSelect` / `maxSelect` (1 = pilihan tunggal) | 2–5 opsi, maks 20 byte per opsi |
| Teks | `minChars` / `maxChars`, `asciiOnly` | 1–200 karakter |

Maksimal 10 pertanyaan per survei, teks pertanyaan maks 100 byte.

Karakter dihitung sebagai Unicode code point: "é" dan emoji masing-masing satu karakter. Dengan `asciiOnly`, kontrak hanya menerima huruf, angka, spasi, dan tanda baca biasa (byte 0x20–0x7E). Kontrak mengecek teks 31 byte sekaligus, jadi jawaban terbesar (10 × 200 emoji) hanya butuh ~350 ribu gas dari batas 1 juta.

### Biaya

| | TON |
| --- | --- |
| Buat survei | 0,05 + pool hadiah |
| Jawab | min 0,05 (lebih untuk teks panjang). 0,01 disimpan sebagai deposit biaya penyimpanan jawaban, sisanya kembali bersama hadiah. |

## Penggunaan

```powershell
npx blueprint build --all
```

```powershell
npx jest
```

```powershell
npx blueprint run deploySurveyDApp --testnet
```

Script lain: `createSurvey`, `answerSurvey`, `surveyResults`.
