import type { Address } from '@ton/core';
import { ANSWER_VALUE, CLOSE_VALUE } from './config';
import { answerBody, answerKey, closeQuestionBody, formatTon, shortAddress } from './contract';
import type { Question } from './contract';
import type { SendMessage } from './Questionnaire';

type Props = {
    question: Question;
    answered: Set<bigint>;
    walletAddress: Address | null;
    canAct: boolean;
    send: SendMessage;
};

export default function QuestionCard({ question, answered, walletAddress, canAct, send }: Props) {
    const totalVotes = question.votes.reduce((sum, v) => sum + v, 0);
    const hasAnswered = walletAddress ? answered.has(answerKey(question.id, walletAddress)) : false;
    const isCreator = walletAddress ? walletAddress.equals(question.creator) : false;
    const paidLeft = question.rewardPerAnswer > 0n ? question.rewardPool / question.rewardPerAnswer : null;
    const canAnswer = canAct && question.isOpen && !hasAnswered;

    return (
        <article className="card question">
            <div className="question-head">
                <span className="muted">#{question.id}</span>
                <span className={question.isOpen ? 'badge open' : 'badge closed'}>
                    {question.isOpen ? 'Terbuka' : 'Ditutup'}
                </span>
            </div>
            <h3>{question.text}</h3>

            <ul className="results">
                {question.options.map((option, i) => {
                    const votes = question.votes[i] ?? 0;
                    const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                    return (
                        <li key={i}>
                            <div className="result-label">
                                <span>{option}</span>
                                <span className="muted">
                                    {votes} suara · {percent}%
                                </span>
                            </div>
                            <div className="bar">
                                <div className="bar-fill" style={{ width: `${percent}%` }} />
                            </div>
                            {canAnswer && (
                                <button
                                    type="button"
                                    className="ghost"
                                    onClick={() => send(answerBody(question.id, i), ANSWER_VALUE, `Jawab #${question.id}`)}
                                >
                                    Pilih “{option}”
                                </button>
                            )}
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

            {hasAnswered && <p className="notice">Kamu sudah menjawab pertanyaan ini.</p>}
            {question.isOpen && walletAddress && !hasAnswered && (
                <p className="muted">
                    Menjawab mengirim {formatTon(ANSWER_VALUE)} TON. Kontrak mengembalikan sisanya bersama hadiah.
                </p>
            )}

            {isCreator && question.isOpen && (
                <button
                    type="button"
                    className="danger"
                    disabled={!canAct}
                    onClick={() => send(closeQuestionBody(question.id), CLOSE_VALUE, `Tutup #${question.id}`)}
                >
                    Tutup pertanyaan & ambil sisa pool
                </button>
            )}
        </article>
    );
}
