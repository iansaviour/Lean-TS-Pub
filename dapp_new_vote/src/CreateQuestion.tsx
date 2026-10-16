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
import { useI18n } from './i18n';
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
    const { t } = useI18n();
    const [text, setText] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [reward, setReward] = useState('0.04');
    const [paidAnswers, setPaidAnswers] = useState('10');

    const rewardNano = parseTon(reward);
    const answerCount = /^\d+$/.test(paidAnswers.trim()) ? BigInt(paidAnswers.trim()) : null;
    const pool = rewardNano !== null && answerCount !== null ? rewardNano * answerCount : null;
    const total = pool !== null ? CREATE_FEE + pool : null;
    const minReward = formatTon(ANSWER_VALUE);

    const textBytes = byteLength(text.trim());
    const problems: string[] = [];
    if (textBytes === 0) problems.push(t.errQuestionEmpty);
    if (textBytes > MAX_QUESTION_BYTES) problems.push(t.errQuestionLong(MAX_QUESTION_BYTES, textBytes));
    options.forEach((option, i) => {
        const bytes = byteLength(option.trim());
        if (bytes === 0) problems.push(t.errOptionEmpty(i + 1));
        if (bytes > MAX_OPTION_BYTES) problems.push(t.errOptionLong(i + 1, MAX_OPTION_BYTES, bytes));
    });
    if (rewardNano === null) {
        problems.push(t.errRewardInvalid);
    } else if (rewardNano <= ANSWER_VALUE) {
        problems.push(t.errRewardLow(minReward));
    }
    if (answerCount === null || answerCount === 0n) {
        problems.push(t.errPaidAnswers);
    }

    const submit = async () => {
        if (problems.length > 0 || rewardNano === null || total === null) return;
        const body = createQuestionBody(
            text.trim(),
            options.map((option) => option.trim()),
            rewardNano,
        );
        const sent = await send(body, total, t.createTxLabel);
        if (sent) {
            setText('');
            setOptions(['', '']);
            onCreated();
        }
    };

    return (
        <section className="card">
            <h2>{t.createTitle}</h2>

            <label className="field">
                <span>{t.questionLabel} <small className="muted">{textBytes}/{MAX_QUESTION_BYTES} byte</small></span>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.questionPlaceholder} />
            </label>

            <div className="field">
                <span>{t.optionsLabel} ({options.length}/{MAX_OPTIONS})</span>
                {options.map((option, i) => (
                    <div className="option-row" key={i}>
                        <input
                            value={option}
                            onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                            placeholder={t.optionPlaceholder(i + 1)}
                        />
                        <button
                            type="button"
                            className="ghost"
                            disabled={options.length <= MIN_OPTIONS}
                            onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        >
                            {t.removeOption}
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="ghost"
                    disabled={options.length >= MAX_OPTIONS}
                    onClick={() => setOptions([...options, ''])}
                >
                    {t.addOption}
                </button>
            </div>

            <div className="field-row">
                <label className="field">
                    <span>{t.rewardLabel}</span>
                    <input value={reward} onChange={(e) => setReward(e.target.value)} inputMode="decimal" />
                    <small className="muted">{t.rewardHint(minReward)}</small>
                </label>
                <label className="field">
                    <span>{t.paidAnswersLabel}</span>
                    <input value={paidAnswers} onChange={(e) => setPaidAnswers(e.target.value)} inputMode="numeric" />
                </label>
            </div>

            {total !== null && pool !== null && (
                <p className="muted">
                    {t.totalSent} <strong>{formatTon(total)} TON</strong>{' '}
                    {t.totalBreakdown(formatTon(CREATE_FEE), formatTon(pool))}
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
                {t.createButton}
            </button>
            {!canAct && <p className="muted">{t.createNeedsWallet}</p>}
        </section>
    );
}
