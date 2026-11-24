import { useState } from 'react';
import { Address, toNano } from '@ton/core';
import { CONTRACT_ADDRESS } from './config';
import { formatTon } from './contract';
import { ANSWER_COST, byteLength, CREATE_FEE, createSurveyBody, LIMITS } from './survey';
import type { QuestionDraft } from './survey';
import { useI18n } from './i18n';
import type { SendMessage } from './SurveyApp';

type Props = {
    canAct: boolean;
    send: SendMessage;
    onCreated: () => void;
};

type DraftState = {
    type: 'choice' | 'text';
    text: string;
    required: boolean;
    options: string[];
    multi: boolean;
    maxSelect: string;
    maxChars: string;
    asciiOnly: boolean;
};

function emptyDraft(): DraftState {
    return {
        type: 'choice',
        text: '',
        required: true,
        options: ['', ''],
        multi: false,
        maxSelect: '2',
        maxChars: '100',
        asciiOnly: true,
    };
}

function parseTon(value: string): bigint | null {
    try {
        const nano = toNano(value.trim() || '0');
        return nano >= 0n ? nano : null;
    } catch {
        return null;
    }
}

function parseWhole(value: string): number | null {
    return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

/** What the contract receives for one question. */
function toPayload(draft: DraftState): QuestionDraft {
    const min = draft.required ? 1 : 0;
    if (draft.type === 'choice') {
        return {
            type: 'choice',
            text: draft.text.trim(),
            options: draft.options.map((option) => option.trim()),
            minSelect: min,
            maxSelect: draft.multi ? (parseWhole(draft.maxSelect) ?? 0) : 1,
        };
    }
    return {
        type: 'text',
        text: draft.text.trim(),
        minChars: min,
        maxChars: parseWhole(draft.maxChars) ?? 0,
        asciiOnly: draft.asciiOnly,
    };
}

export default function CreateSurvey({ canAct, send, onCreated }: Props) {
    const { t } = useI18n();
    const [drafts, setDrafts] = useState<DraftState[]>([emptyDraft()]);
    const [reward, setReward] = useState('0.05');
    const [paidAnswers, setPaidAnswers] = useState('10');

    const rewardNano = parseTon(reward);
    const hasReward = rewardNano !== null && rewardNano > 0n;
    const answerCount = parseWhole(paidAnswers);
    const pool = !hasReward ? 0n : answerCount !== null ? rewardNano * BigInt(answerCount) : null;
    const total = pool !== null ? CREATE_FEE + pool : null;
    const minReward = formatTon(ANSWER_COST);

    const problems: string[] = [];
    if (drafts.length < LIMITS.minQuestions) problems.push(t.errNoQuestions);
    if (drafts.length > LIMITS.maxQuestions) problems.push(t.errTooManyQuestions(LIMITS.maxQuestions));

    drafts.forEach((draft, qi) => {
        const n = qi + 1;
        const textBytes = byteLength(draft.text.trim());
        if (textBytes === 0) problems.push(t.errQuestionEmpty(n));
        if (textBytes > LIMITS.maxQuestionBytes) {
            problems.push(t.errQuestionLong(n, LIMITS.maxQuestionBytes, textBytes));
        }

        if (draft.type === 'choice') {
            draft.options.forEach((option, oi) => {
                const bytes = byteLength(option.trim());
                if (bytes === 0) problems.push(t.errOptionEmpty(n, oi + 1));
                if (bytes > LIMITS.maxOptionBytes) {
                    problems.push(t.errOptionLong(n, oi + 1, LIMITS.maxOptionBytes, bytes));
                }
            });
            const maxSelect = parseWhole(draft.maxSelect);
            if (draft.multi && (maxSelect === null || maxSelect < 2 || maxSelect > draft.options.length)) {
                problems.push(t.errMaxSelect(n, draft.options.length));
            }
        } else {
            const maxChars = parseWhole(draft.maxChars);
            if (maxChars === null || maxChars < 1 || maxChars > LIMITS.maxTextChars) {
                problems.push(t.errMaxChars(n, LIMITS.maxTextChars));
            }
        }
    });

    if (rewardNano === null) {
        problems.push(t.errRewardInvalid);
    } else if (hasReward && rewardNano <= ANSWER_COST) {
        problems.push(t.errRewardLow(minReward));
    }
    if (hasReward && (answerCount === null || answerCount === 0)) {
        problems.push(t.errPaidAnswers);
    }

    const updateDraft = (index: number, patch: Partial<DraftState>) => {
        setDrafts(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    };

    const submit = async () => {
        if (problems.length > 0 || rewardNano === null || total === null) return;
        const body = createSurveyBody(drafts.map(toPayload), rewardNano);
        const sent = await send(Address.parse(CONTRACT_ADDRESS), body, total, t.createTxLabel);
        if (sent) {
            setDrafts([emptyDraft()]);
            onCreated();
        }
    };

    return (
        <section className="card">
            <h2>{t.createTitle}</h2>

            <div className="field">
                <span>{t.questionsCount(drafts.length, LIMITS.maxQuestions)}</span>
            </div>

            {drafts.map((draft, qi) => (
                <div className="set-draft" key={qi}>
                    <div className="set-draft-head">
                        <strong>{t.questionN(qi + 1)}</strong>
                        <button
                            type="button"
                            className="ghost"
                            disabled={drafts.length <= LIMITS.minQuestions}
                            onClick={() => setDrafts(drafts.filter((_, i) => i !== qi))}
                        >
                            {t.removeQuestion}
                        </button>
                    </div>

                    <label className="field">
                        <span>
                            <small className="muted">
                                {byteLength(draft.text.trim())}/{LIMITS.maxQuestionBytes} byte
                            </small>
                        </span>
                        <input
                            value={draft.text}
                            onChange={(e) => updateDraft(qi, { text: e.target.value })}
                            placeholder={t.questionPlaceholder}
                        />
                    </label>

                    <div className="segmented" role="radiogroup">
                        {(['choice', 'text'] as const).map((type) => (
                            <button
                                key={type}
                                type="button"
                                role="radio"
                                aria-checked={draft.type === type}
                                className={draft.type === type ? 'active' : ''}
                                onClick={() => updateDraft(qi, { type })}
                            >
                                {type === 'choice' ? t.typeChoice : t.typeText}
                            </button>
                        ))}
                    </div>

                    {draft.type === 'choice' ? (
                        <div className="field">
                            <span>
                                {t.optionsLabel} ({draft.options.length}/{LIMITS.maxOptions})
                            </span>
                            {draft.options.map((option, oi) => (
                                <div className="option-row" key={oi}>
                                    <input
                                        value={option}
                                        onChange={(e) =>
                                            updateDraft(qi, {
                                                options: draft.options.map((o, j) => (j === oi ? e.target.value : o)),
                                            })
                                        }
                                        placeholder={t.optionPlaceholder(oi + 1)}
                                    />
                                    <button
                                        type="button"
                                        className="ghost"
                                        disabled={draft.options.length <= LIMITS.minOptions}
                                        onClick={() =>
                                            updateDraft(qi, { options: draft.options.filter((_, j) => j !== oi) })
                                        }
                                    >
                                        {t.removeOption}
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="primary full-width"
                                disabled={draft.options.length >= LIMITS.maxOptions}
                                onClick={() => updateDraft(qi, { options: [...draft.options, ''] })}
                            >
                                {t.addOption}
                            </button>

                            <label className="check-row">
                                <input
                                    type="checkbox"
                                    checked={draft.multi}
                                    onChange={(e) =>
                                        updateDraft(qi, {
                                            multi: e.target.checked,
                                            maxSelect: String(draft.options.length),
                                        })
                                    }
                                />
                                {t.multiSelect}
                            </label>
                            {draft.multi && (
                                <label className="field inline-field">
                                    <span>{t.maxSelectLabel}</span>
                                    <input
                                        value={draft.maxSelect}
                                        onChange={(e) => updateDraft(qi, { maxSelect: e.target.value })}
                                        inputMode="numeric"
                                    />
                                </label>
                            )}
                        </div>
                    ) : (
                        <div className="field">
                            <label className="field inline-field">
                                <span>{t.maxCharsLabel}</span>
                                <input
                                    value={draft.maxChars}
                                    onChange={(e) => updateDraft(qi, { maxChars: e.target.value })}
                                    inputMode="numeric"
                                />
                            </label>
                            <label className="check-row">
                                <input
                                    type="checkbox"
                                    checked={draft.asciiOnly}
                                    onChange={(e) => updateDraft(qi, { asciiOnly: e.target.checked })}
                                />
                                {t.asciiOnly}
                            </label>
                            {draft.asciiOnly && <small className="muted">{t.asciiOnlyHint}</small>}
                        </div>
                    )}

                    <label className="check-row">
                        <input
                            type="checkbox"
                            checked={draft.required}
                            onChange={(e) => updateDraft(qi, { required: e.target.checked })}
                        />
                        {t.required}
                    </label>
                </div>
            ))}

            <button
                type="button"
                className="primary full-width"
                disabled={drafts.length >= LIMITS.maxQuestions}
                onClick={() => setDrafts([...drafts, emptyDraft()])}
            >
                {t.addQuestion}
            </button>

            <div className="field-row reward-row">
                <label className="field">
                    <span>{t.rewardLabel}</span>
                    <input value={reward} onChange={(e) => setReward(e.target.value)} inputMode="decimal" />
                    <small className="muted">{t.rewardHint(minReward)}</small>
                </label>
                {hasReward && (
                    <label className="field">
                        <span>{t.paidAnswersLabel}</span>
                        <input
                            value={paidAnswers}
                            onChange={(e) => setPaidAnswers(e.target.value)}
                            inputMode="numeric"
                        />
                    </label>
                )}
            </div>

            {total !== null && pool !== null && (
                <p className="muted">
                    {t.totalSent} <strong>{formatTon(total)} TON</strong>{' '}
                    {hasReward
                        ? t.totalBreakdown(formatTon(CREATE_FEE), formatTon(pool))
                        : t.totalNoReward(formatTon(CREATE_FEE))}
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
