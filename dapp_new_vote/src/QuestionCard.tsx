import { useState } from 'react';
import type { Address } from '@ton/core';
import { ANSWER_VALUE, CLOSE_VALUE } from './config';
import { answerBody, answerKey, closeQuestionBody, formatTon, shortAddress } from './contract';
import type { Question } from './contract';
import type { SendMessage } from './Questionnaire';
import { questionHash, questionUrl } from './routes';

type Props = {
    question: Question;
    answered: Set<bigint>;
    walletAddress: Address | null;
    canAct: boolean;
    send: SendMessage;
    detail?: boolean;
};

export default function QuestionCard({ question, answered, walletAddress, canAct, send, detail = false }: Props) {
    const totalVotes = question.votes.reduce((sum, v) => sum + v, 0);
    const hasAnswered = walletAddress ? answered.has(answerKey(question.id, walletAddress)) : false;
    const isCreator = walletAddress ? walletAddress.equals(question.creator) : false;
    const paidLeft = question.rewardPerAnswer > 0n ? question.rewardPool / question.rewardPerAnswer : null;
    const canAnswer = canAct && question.isOpen && !hasAnswered;
    const rewardBelowCost = question.rewardPerAnswer <= ANSWER_VALUE;

    return (
        <article className="card question">
            <div className="question-head">
                <span className="muted">#{question.id}</span>
                <div className="question-head-right">
                    <span className={question.isOpen ? 'badge open' : 'badge closed'}>
                        {question.isOpen ? 'Terbuka' : 'Ditutup'}
                    </span>
                    <ShareButton questionId={question.id} text={question.text} />
                </div>
            </div>
            <h3>{detail ? question.text : <a href={questionHash(question.id)}>{question.text}</a>}</h3>

            <ul className="results">
                {question.options.map((option, i) => {
                    const votes = question.votes[i] ?? 0;
                    const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                    return (
                        <li key={i} className="result-row">
                            {canAnswer && (
                                <button
                                    type="button"
                                    className="vote"
                                    aria-label={`Pilih ${option}`}
                                    onClick={() => send(answerBody(question.id, i), ANSWER_VALUE, `Jawab #${question.id}`)}
                                >
                                    Pilih
                                </button>
                            )}
                            <div className="result-body">
                                <div className="result-label">
                                    <span>{option}</span>
                                    <span className="muted">
                                        {votes} suara · {percent}%
                                    </span>
                                </div>
                                <div className="bar">
                                    <div className="bar-fill" style={{ width: `${percent}%` }} />
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>

            <p className="muted">
                {totalVotes} jawaban · dibuat oleh {shortAddress(question.creator)}
                {question.rewardPerAnswer > 0n && (
                    <>
                        {' '}· hadiah {formatTon(question.rewardPerAnswer)} TON per jawaban · sisa pool{' '}
                        {formatTon(question.rewardPool)} TON ({paidLeft?.toString()} jawaban lagi)
                    </>
                )}
            </p>

            {question.isOpen && rewardBelowCost && (
                <p className="notice error">
                    Hadiah pertanyaan ini tidak lebih dari biaya menjawab ({formatTon(ANSWER_VALUE)} TON), jadi penjawab
                    bisa menerima kembali lebih sedikit dari yang dikirim.
                </p>
            )}
            {hasAnswered && <p className="notice">Kamu sudah menjawab pertanyaan ini.</p>}
            {question.isOpen && walletAddress && !hasAnswered && (
                <p className="muted">
                    Menjawab mengirim {formatTon(ANSWER_VALUE)} TON. Kontrak mengembalikan sisanya bersama hadiah.
                </p>
            )}

            {isCreator && question.isOpen && (
                <button
                    type="button"
                    className="danger full-width"
                    disabled={!canAct}
                    onClick={() => send(closeQuestionBody(question.id), CLOSE_VALUE, `Tutup #${question.id}`)}
                >
                    Tutup pertanyaan & ambil sisa pool
                </button>
            )}
        </article>
    );
}

function ShareButton({ questionId, text }: { questionId: number; text: string }) {
    const [copied, setCopied] = useState(false);

    const share = async () => {
        const url = questionUrl(questionId);
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

    const label = copied ? 'Link disalin' : 'Bagikan link';

    return (
        <button type="button" className="icon-button" onClick={share} aria-label={label} title={label}>
            {copied ? (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
