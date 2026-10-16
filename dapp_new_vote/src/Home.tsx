import type { ContractState } from './contract';
import { formatTon } from './contract';
import { ANSWER_VALUE, CREATE_FEE } from './config';
import type { Page } from './Questionnaire';

type Props = {
    state: ContractState | null;
    walletConnected: boolean;
    go: (page: Page) => void;
};

export default function Home({ state, walletConnected, go }: Props) {
    const questions = state?.kind === 'ready' ? state.questions : [];
    const open = questions.filter((q) => q.isOpen).length;
    const answers = questions.reduce((sum, q) => sum + q.votes.reduce((a, v) => a + v, 0), 0);

    return (
        <>
            <section className="card">
                <h2>Selamat datang</h2>
                <p>
                    Buat pertanyaan dengan 2–5 pilihan, lalu siapa pun dengan wallet TON testnet bisa menjawab dan
                    mendapat hadiah TON. Setiap alamat hanya bisa menjawab sekali, dan setiap pertanyaan punya link
                    sendiri untuk dibagikan.
                </p>
                {!walletConnected && <p className="muted">Hubungkan wallet testnet dengan tombol di kanan atas untuk mulai.</p>}
            </section>

            {state?.kind === 'ready' && (
                <section className="stats">
                    <div className="stat">
                        <strong>{questions.length}</strong>
                        <span>Pertanyaan</span>
                    </div>
                    <div className="stat">
                        <strong>{open}</strong>
                        <span>Masih terbuka</span>
                    </div>
                    <div className="stat">
                        <strong>{answers}</strong>
                        <span>Jawaban</span>
                    </div>
                </section>
            )}

            <section className="card">
                <h2>Cara kerja</h2>
                <ol className="steps">
                    <li>
                        <strong>Buat kuesioner.</strong> Biaya {formatTon(CREATE_FEE)} TON, ditambah pool hadiah. Hadiah
                        per jawaban harus lebih dari {formatTon(ANSWER_VALUE)} TON, supaya penjawab selalu untung.
                    </li>
                    <li>
                        <strong>Jawab kuesioner.</strong> Kirim {formatTon(ANSWER_VALUE)} TON. Sisanya dikembalikan bersama
                        hadiah, kalau ada.
                    </li>
                    <li>
                        <strong>Tutup kapan saja.</strong> Pembuat bisa menutup pertanyaannya dan mengambil sisa pool.
                        Pertanyaan juga tertutup sendiri saat pool habis.
                    </li>
                </ol>
            </section>

            <div className="actions">
                <button type="button" className="primary" onClick={() => go('create')}>
                    Buat kuesioner
                </button>
                <button type="button" className="ghost" onClick={() => go('list')}>
                    Lihat kuesioner
                </button>
            </div>
        </>
    );
}
