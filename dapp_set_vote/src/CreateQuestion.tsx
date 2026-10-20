import { useState } from 'react';
import { toNano } from '@ton/core';
import {
    ANSWER_VALUE,
    CREATE_FEE,
    MAX_OPTION_BYTES,
    MAX_OPTIONS,
    MAX_QUESTION_BYTES,
    MAX_QUESTIONS,
    MIN_OPTIONS,
    MIN_QUESTIONS,
} from './config';
import { byteLength, createSetBody, formatTon } from './contract';
import type { QuestionDraft } from './contract';
import { useI18n } from './i18n';
import type { SendMessage } from './Questionnaire';

type Props = {
    canAct: boolean;
    send: SendMessage;
    onCreated: () => void;
};

type DraftState = {
    text: string;
    options: string[];
};

function parseTon(value: string): bigint | null {
    try {
        const nano = toNano(value.trim() || '0');
        return nano >= 0n ? nano : null;
    } catch {
        return null;
    }
}

function emptyDraft(): DraftState {
    return { text: '', options: ['', ''] };
}

export default function CreateQuestion({ canAct, send, onCreated }: Props) {
    const { t } = useI18n();
    const [drafts, setDrafts] = useState<DraftState[]>([emptyDraft()]);
    const [reward, setReward] = useState('0.04');
    const [paidAnswers, setPaidAnswers] = useState('10');

    const rewardNano = parseTon(reward);
    const answerCount = /^\d+$/.test(paidAnswers.trim()) ? BigInt(paidAnswers.trim()) : null;
    const pool = rewardNano !== null && answerCount !== null ? rewardNano * answerCount : null;
    const total = pool !== null ? CREATE_FEE + pool : null;
    const minReward = formatTon(ANSWER_VALUE);

    const problems: string[] = [];
    if (drafts.length < MIN_QUESTIONS) problems.push(t.errNoQuestions);
    if (drafts.length > MAX_QUESTIONS) problems.push(t.errTooManyQuestions(MAX_QUESTIONS));

    drafts.forEach((draft, qi) => {
        const textBytes = byteLength(draft.text.trim());
        if (textBytes === 0) problems.push(t.errQuestionEmpty(qi + 1));
        if (textBytes > MAX_QUESTION_BYTES) {
            problems.push(t.errQuestionLong(qi + 1, MAX_QUESTION_BYTES, textBytes));
        }
        draft.options.forEach((option, oi) => {
            const bytes = byteLength(option.trim());
            if (bytes === 0) problems.push(t.errOptionEmpty(qi + 1, oi + 1));
            if (bytes > MAX_OPTION_BYTES) {
                problems.push(t.errOptionLong(qi + 1, oi + 1, MAX_OPTION_BYTES, bytes));
            }
        });
    });

    if (rewardNano === null) {
        problems.push(t.errRewardInvalid);
    } else if (rewardNano <= ANSWER_VALUE) {
        problems.push(t.errRewardLow(minReward));
    }
    if (answerCount === null || answerCount === 0n) {
        problems.push(t.errPaidAnswers);
    }

    const updateDraft = (index: number, next: DraftState) => {
        setDrafts(drafts.map((d, i) => (i === index ? next : d)));
    };

    const submit = async () => {
        if (problems.length > 0 || rewardNano === null || total === null) return;
        const payload: QuestionDraft[] = drafts.map((draft) => ({
            text: draft.text.trim(),
            options: draft.options.map((option) => option.trim()),
        }));
        const body = createSetBody(payload, rewardNano);
        const sent = await send(body, total, t.createTxLabel);
        if (sent) {
            setDrafts([emptyDraft()]);
            onCreated();
        }
    };

    return (
        <section className="card">
            <h2>{t.createTitle}</h2>

            <div className="field">
                <span>{t.questionsInSet(drafts.length, MAX_QUESTIONS)}</span>
            </div>

            {drafts.map((draft, qi) => (
                <div className="set-draft" key={qi}>
                    <div className="set-draft-head">
                        <strong>{t.questionN(qi + 1)}</strong>
                        <button
                            type="button"
                            className="ghost"
                            disabled={drafts.length <= MIN_QUESTIONS}
                            onClick={() => setDrafts(drafts.filter((_, i) => i !== qi))}
                        >
                            {t.removeQuestion}
                        </button>
                    </div>

                    <label className="field">
                        <span>
                            <small className="muted">
                                {byteLength(draft.text.trim())}/{MAX_QUESTION_BYTES} byte
                            </small>
                        </span>
                        <input
                            value={draft.text}
                            onChange={(e) => updateDraft(qi, { ...draft, text: e.target.value })}
                            placeholder={t.questionPlaceholder}
                        />
                    </label>

                    <div className="field">
                        <span>
                            {t.optionsLabel} ({draft.options.length}/{MAX_OPTIONS})
                        </span>
                        {draft.options.map((option, oi) => (
                            <div className="option-row" key={oi}>
                                <input
                                    value={option}
                                    onChange={(e) =>
                                        updateDraft(qi, {
                                            ...draft,
                                            options: draft.options.map((o, j) =>
                                                j === oi ? e.target.value : o,
                                            ),
                                        })
                                    }
                                    placeholder={t.optionPlaceholder(oi + 1)}
                                />
                                <button
                                    type="button"
                                    className="ghost"
                                    disabled={draft.options.length <= MIN_OPTIONS}
                                    onClick={() =>
                                        updateDraft(qi, {
                                            ...draft,
                                            options: draft.options.filter((_, j) => j !== oi),
                                        })
                                    }
                                >
                                    {t.removeOption}
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            className="ghost"
                            disabled={draft.options.length >= MAX_OPTIONS}
                            onClick={() =>
                                updateDraft(qi, { ...draft, options: [...draft.options, ''] })
                            }
                        >
                            {t.addOption}
                        </button>
                    </div>
                </div>
            ))}

            <button
                type="button"
                className="ghost"
                disabled={drafts.length >= MAX_QUESTIONS}
                onClick={() => setDrafts([...drafts, emptyDraft()])}
            >
                {t.addQuestion}
            </button>

            <div className="field-row">
                <label className="field">
                    <span>{t.rewardLabel}</span>
                    <input value={reward} onChange={(e) => setReward(e.target.value)} inputMode="decimal" />
                    <small className="muted">{t.rewardHint(minReward)}</small>
                </label>
                <label className="field">
                    <span>{t.paidAnswersLabel}</span>
                    <input
                        value={paidAnswers}
                        onChange={(e) => setPaidAnswers(e.target.value)}
                        inputMode="numeric"
                    />
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

            <button
                type="button"
                className="primary"
                disabled={!canAct || problems.length > 0}
                onClick={submit}
            >
                {t.createButton}
            </button>
            {!canAct && <p className="muted">{t.createNeedsWallet}</p>}
        </section>
    );
}
