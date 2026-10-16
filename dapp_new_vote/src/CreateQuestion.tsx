import { useState } from 'react';
import { toNano } from '@ton/core';
import {
    ANSWER_VALUE,
    CREATE_FEE,
    MAX_OPTION_BYTES,
    MAX_OPTIONS,
    MAX_QUESTION_BYTES,
    MIN_OPTIONS,
} from './config';
import { byteLength, createQuestionBody, formatTon } from './contract';
import type { SendMessage } from './Questionnaire';

type Props = {
    canAct: boolean;
    send: SendMessage;
    onCreated: () => void;
};

function parseTon(value: string): bigint | null {
    try {
        const nano = toNano(value.trim() || '0');
        return nano >= 0n ? nano : null;
    } catch {
        return null;
    }
}

export default function CreateQuestion({ canAct, send, onCreated }: Props) {
    const [text, setText] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [reward, setReward] = useState('0.04');
    const [paidAnswers, setPaidAnswers] = useState('10');

    const rewardNano = parseTon(reward);
    const answerCount = /^\d+$/.test(paidAnswers.trim()) ? BigInt(paidAnswers.trim()) : null;
    const pool = rewardNano !== null && answerCount !== null ? rewardNano * answerCount : null;
    const total = pool !== null ? CREATE_FEE + pool : null;

    const textBytes = byteLength(text.trim());
    const problems: string[] = [];
    if (textBytes === 0) problems.push('Pertanyaan belum diisi.');
    if (textBytes > MAX_QUESTION_BYTES) problems.push(`Pertanyaan maksimal ${MAX_QUESTION_BYTES} byte (sekarang ${textBytes}).`);
    options.forEach((option, i) => {
        const bytes = byteLength(option.trim());
        if (bytes === 0) problems.push(`Pilihan ${i + 1} belum diisi.`);
        if (bytes > MAX_OPTION_BYTES) problems.push(`Pilihan ${i + 1} maksimal ${MAX_OPTION_BYTES} byte (sekarang ${bytes}).`);
    });
    if (rewardNano === null) {
        problems.push('Hadiah per jawaban bukan angka TON yang valid.');
    } else if (rewardNano <= ANSWER_VALUE) {
        problems.push(
            `Hadiah per jawaban harus lebih dari ${formatTon(ANSWER_VALUE)} TON, yaitu jumlah yang dikirim penjawab.`,
        );
    }
    if (answerCount === null || answerCount === 0n) {
        problems.push('Jumlah jawaban berhadiah minimal 1.');
    }

    const submit = async () => {
        if (problems.length > 0 || rewardNano === null || total === null) return;
        const body = createQuestionBody(
            text.trim(),
            options.map((option) => option.trim()),
            rewardNano,
        );
        const sent = await send(body, total, 'Buat pertanyaan');
        if (sent) {
            setText('');
            setOptions(['', '']);
            onCreated();
        }
    };

    return (
        <section className="card">
            <h2>Buat kuesioner</h2>

            <label className="field">
                <span>Pertanyaan <small className="muted">{textBytes}/{MAX_QUESTION_BYTES} byte</small></span>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Apakah kamu setuju dengan…" />
            </label>

            <div className="field">
                <span>Pilihan ({options.length}/{MAX_OPTIONS})</span>
                {options.map((option, i) => (
                    <div className="option-row" key={i}>
                        <input
                            value={option}
                            onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                            placeholder={`Pilihan ${i + 1}`}
                        />
                        <button
                            type="button"
                            className="ghost"
                            disabled={options.length <= MIN_OPTIONS}
                            onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        >
                            Hapus
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="ghost"
                    disabled={options.length >= MAX_OPTIONS}
                    onClick={() => setOptions([...options, ''])}
                >
                    + Tambah pilihan
                </button>
            </div>

            <div className="field-row">
                <label className="field">
                    <span>Hadiah per jawaban (TON)</span>
                    <input value={reward} onChange={(e) => setReward(e.target.value)} inputMode="decimal" />
                    <small className="muted">Harus lebih dari {formatTon(ANSWER_VALUE)} TON (biaya menjawab).</small>
                </label>
                <label className="field">
                    <span>Jumlah jawaban berhadiah</span>
                    <input value={paidAnswers} onChange={(e) => setPaidAnswers(e.target.value)} inputMode="numeric" />
                </label>
            </div>

            {total !== null && pool !== null && (
                <p className="muted">
                    Dikirim: <strong>{formatTon(total)} TON</strong> ({formatTon(CREATE_FEE)} biaya kontrak +{' '}
                    {formatTon(pool)} TON pool hadiah). Pertanyaan tertutup otomatis saat pool habis, dan pembuat bisa
                    menutupnya kapan saja untuk mengambil sisa pool.
                </p>
            )}

            {problems.length > 0 && (
                <ul className="problems">
                    {problems.map((problem) => (
                        <li key={problem}>{problem}</li>
                    ))}
                </ul>
            )}

            <button type="button" className="primary" disabled={!canAct || problems.length > 0} onClick={submit}>
                Buat pertanyaan
            </button>
            {!canAct && <p className="muted">Hubungkan wallet testnet untuk membuat pertanyaan.</p>}
        </section>
    );
}
