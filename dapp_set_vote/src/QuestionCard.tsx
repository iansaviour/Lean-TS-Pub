import { useState } from 'react';
import type { Address } from '@ton/core';
import { ANSWER_VALUE, CLOSE_VALUE } from './config';
import {
    answerBody,
    answerKey,
    closeSetBody,
    completionCount,
    formatTon,
    shortAddress,
} from './contract';
import type { QuestionnaireSet } from './contract';
import { useI18n } from './i18n';
import type { SendMessage } from './Questionnaire';
import { setHash, setUrl } from './routes';

type Props = {
    set: QuestionnaireSet;
    answered: Set<bigint>;
    walletAddress: Address | null;
    canAct: boolean;
    send: SendMessage;
    detail?: boolean;
};

export default function QuestionCard({
    set,
    answered,
    walletAddress,
    canAct,
    send,
    detail = false,
}: Props) {
    const { t } = useI18n();
    const completions = completionCount(set);
    const hasAnswered = walletAddress ? answered.has(answerKey(set.id, walletAddress)) : false;
    const isCreator = walletAddress ? walletAddress.equals(set.creator) : false;
    const paidLeft =
        set.rewardPerCompletion > 0n ? set.rewardPool / set.rewardPerCompletion : null;
    const canAnswer = canAct && set.isOpen && !hasAnswered;
    const rewardBelowCost = set.rewardPerCompletion <= ANSWER_VALUE;
    const preview = set.questions[0]?.text ?? `Set #${set.id}`;

    const [choices, setChoices] = useState<(number | null)[]>(() =>
        set.questions.map(() => null),
    );
    const [incomplete, setIncomplete] = useState(false);

    const pick = (qi: number, oi: number) => {
        setChoices((prev) => prev.map((c, i) => (i === qi ? oi : c)));
        setIncomplete(false);
    };

    const submit = () => {
        if (choices.some((c) => c === null)) {
            setIncomplete(true);
            return;
        }
        void send(
            answerBody(set.id, choices as number[]),
            ANSWER_VALUE,
            t.answerTxLabel(set.id),
        );
    };

    return (
        <article className="card question">
            <div className="question-head">
                <span className="muted">
                    #{set.id} · {t.setPreview(set.questions.length)}
                </span>
                <div className="question-head-right">
                    <span className={set.isOpen ? 'badge open' : 'badge closed'}>
                        {set.isOpen ? t.open : t.closed}
                    </span>
                    <ShareButton setId={set.id} text={preview} />
                </div>
            </div>

            {!detail ? (
                <h3>
                    <a href={setHash(set.id)}>{preview}</a>
                </h3>
            ) : (
                <h3>{preview}</h3>
            )}

            {detail &&
                set.questions.map((question, qi) => {
                    const totalVotes = question.votes.reduce((sum, v) => sum + v, 0);
                    return (
                        <div className="set-question" key={qi}>
                            <h4>
                                {t.questionN(qi + 1)}. {question.text}
                            </h4>
                            <ul className="results">
                                {question.options.map((option, oi) => {
                                    const votes = question.votes[oi] ?? 0;
                                    const percent =
                                        totalVotes > 0
                                            ? Math.round((votes / totalVotes) * 100)
                                            : 0;
                                    const selected = choices[qi] === oi;
                                    return (
                                        <li key={oi} className="result-row">
                                            {canAnswer && (
                                                <button
                                                    type="button"
                                                    className={selected ? 'vote selected' : 'vote'}
                                                    aria-pressed={selected}
                                                    aria-label={option}
                                                    onClick={() => pick(qi, oi)}
                                                >
                                                    {selected ? '✓' : t.pickOption}
                                                </button>
                                            )}
                                            <div className="result-body">
                                                <div className="result-label">
                                                    <span>{option}</span>
                                                    {(hasAnswered || !set.isOpen) && (
                                                        <span className="muted">
                                                            {t.votes(votes, percent)}
                                                        </span>
                                                    )}
                                                </div>
                                                {(hasAnswered || !set.isOpen) && (
                                                    <div className="bar">
                                                        <div
                                                            className="bar-fill"
                                                            style={{ width: `${percent}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}

            {!detail && (
                <p className="muted">
                    {set.questions
                        .slice(1)
                        .map((q) => q.text)
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(' · ')}
                    {set.questions.length > 3 ? '…' : ''}
                </p>
            )}

            <p className="muted">
                {t.summary(completions, set.questions.length, shortAddress(set.creator))}
                {set.rewardPerCompletion > 0n &&
                    t.rewardSummary(
                        formatTon(set.rewardPerCompletion),
                        formatTon(set.rewardPool),
                        paidLeft?.toString() ?? '0',
                    )}
            </p>

            {set.isOpen && rewardBelowCost && (
                <p className="notice error">{t.rewardBelowCost(formatTon(ANSWER_VALUE))}</p>
            )}
            {hasAnswered && <p className="notice">{t.alreadyAnswered}</p>}
            {detail && canAnswer && (
                <>
                    <p className="muted">{t.answerCost(formatTon(ANSWER_VALUE))}</p>
                    {incomplete && <p className="notice error">{t.errIncomplete}</p>}
                    <button type="button" className="primary full-width" onClick={submit}>
                        {t.submitAnswers}
                    </button>
                </>
            )}
            {!detail && set.isOpen && !hasAnswered && (
                <p className="muted">
                    <a href={setHash(set.id)}>{t.submitAnswers} →</a>
                </p>
            )}

            {isCreator && set.isOpen && (
                <button
                    type="button"
                    className="danger full-width"
                    disabled={!canAct}
                    onClick={() =>
                        send(closeSetBody(set.id), CLOSE_VALUE, t.closeTxLabel(set.id))
                    }
                >
                    {t.closeButton}
                </button>
            )}
        </article>
    );
}

function ShareButton({ setId, text }: { setId: number; text: string }) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);

    const share = async () => {
        const url = setUrl(setId);
        if (navigator.share) {
            try {
                await navigator.share({ title: text, url });
                return;
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
            }
        }
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
    };

    const label = copied ? t.copied : t.share;

    return (
        <button type="button" className="icon-button" onClick={share} aria-label={label} title={label}>
            {copied ? (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                        d="M5 12l5 5L20 7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                    </g>
                </svg>
            )}
        </button>
    );
}
