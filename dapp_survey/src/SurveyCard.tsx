import { useState } from 'react';
import type { Address } from '@ton/core';
import { EXPLORER } from './config';
import { formatTon, friendlyAddress, shortAddress } from './contract';
import {
    ANSWER_COST,
    checkAnswer,
    CLOSE_VALUE,
    closeSurveyBody,
    countChars,
    estimateSubmitValue,
    respondentKey,
    STORAGE_DEPOSIT,
    submitBody,
    toPlainPunctuation,
} from './survey';
import type { Answer, AnswerProblem, ChoiceQuestion, Question, Survey, TextQuestion } from './survey';
import { useI18n } from './i18n';
import type { Messages } from './messages';
import type { SendMessage } from './SurveyApp';
import { surveyHash, surveyUrl } from './routes';

type Props = {
    survey: Survey;
    walletAddress: Address | null;
    canAct: boolean;
    send: SendMessage;
    detail?: boolean;
};

function emptyAnswer(question: Question): Answer {
    return question.type === 'choice' ? [] : '';
}

function problemText(t: Messages, problem: AnswerProblem): string {
    switch (problem.kind) {
        case 'select-exactly':
            return t.probSelectExactly(problem.n);
        case 'select-range':
            return t.probSelectRange(problem.min, problem.max);
        case 'text-length':
            return t.probTextLength(problem.min, problem.max, problem.now);
        case 'not-ascii':
            return t.probNotAscii(problem.char);
    }
}

function QuestionTags({ question }: { question: Question }) {
    const { t } = useI18n();
    const tags: string[] = [];
    if (question.type === 'choice') {
        tags.push(question.maxSelect === 1 ? t.tagSingle : t.tagMulti(question.minSelect, question.maxSelect));
        if (question.minSelect === 0) tags.push(t.tagOptional);
    } else {
        tags.push(t.tagText(question.maxChars));
        if (question.asciiOnly) tags.push(t.tagAscii);
        if (question.minChars === 0) tags.push(t.tagOptional);
    }
    return (
        <div className="tags">
            {tags.map((tag) => (
                <span key={tag} className="tag">
                    {tag}
                </span>
            ))}
        </div>
    );
}

export default function SurveyCard({ survey, walletAddress, canAct, send, detail = false }: Props) {
    const { t } = useI18n();
    const responses = survey.responses.length;
    const myIndex = walletAddress ? survey.answered.get(respondentKey(walletAddress)) : undefined;
    const hasAnswered = myIndex !== undefined;
    const isCreator = walletAddress ? walletAddress.equals(survey.creator) : false;
    const paidLeft = survey.rewardPerCompletion > 0n ? survey.rewardPool / survey.rewardPerCompletion : null;
    const canAnswer = canAct && survey.isOpen && !hasAnswered;
    const showResults = hasAnswered || !survey.isOpen || isCreator;
    const rewardBelowCost = survey.rewardPerCompletion > 0n && survey.rewardPerCompletion <= ANSWER_COST;
    const preview = survey.questions[0]?.text ?? `Survey #${survey.id}`;

    const [answers, setAnswers] = useState<Answer[]>(() => survey.questions.map(emptyAnswer));
    const [problems, setProblems] = useState<string[]>([]);

    const setAnswer = (qi: number, answer: Answer) => {
        setAnswers((prev) => prev.map((a, i) => (i === qi ? answer : a)));
        setProblems([]);
    };

    const submit = () => {
        const found = survey.questions.flatMap((question, qi) => {
            const problem = checkAnswer(question, answers[qi]);
            return problem ? [t.problemIn(qi + 1, problemText(t, problem))] : [];
        });
        if (found.length > 0) {
            setProblems(found);
            return;
        }
        void send(survey.address, submitBody(answers), estimateSubmitValue(answers), t.answerTxLabel(survey.id));
    };

    return (
        <article className="card question">
            <div className="question-head">
                <span className="muted">
                    #{survey.id} · {t.surveyPreview(survey.questions.length)}
                </span>
                <div className="question-head-right">
                    <span className={survey.isOpen ? 'badge open' : 'badge closed'}>
                        {survey.isOpen ? t.open : t.closed}
                    </span>
                    <ShareButton surveyId={survey.id} text={preview} />
                </div>
            </div>

            {detail ? (
                <h3>{preview}</h3>
            ) : (
                <h3>
                    <a href={surveyHash(survey.id)}>{preview}</a>
                </h3>
            )}

            {detail &&
                survey.questions.map((question, qi) => (
                    <div className="set-question" key={qi}>
                        <h4>
                            {t.questionN(qi + 1)}. {question.text}
                        </h4>
                        <QuestionTags question={question} />
                        {canAnswer &&
                            (question.type === 'choice' ? (
                                <ChoiceInput
                                    question={question}
                                    value={answers[qi] as number[]}
                                    onChange={(a) => setAnswer(qi, a)}
                                />
                            ) : (
                                <TextInput
                                    question={question}
                                    value={answers[qi] as string}
                                    onChange={(a) => setAnswer(qi, a)}
                                />
                            ))}
                        {showResults &&
                            (question.type === 'choice' ? (
                                <ChoiceResults question={question} responses={responses} />
                            ) : (
                                <TextResults survey={survey} qi={qi} myIndex={myIndex} />
                            ))}
                    </div>
                ))}

            {!detail && (
                <p className="muted">
                    {survey.questions
                        .slice(1)
                        .map((q) => q.text)
                        .slice(0, 2)
                        .join(' · ')}
                    {survey.questions.length > 3 ? '…' : ''}
                </p>
            )}

            <div className="muted set-summary">
                <div>{t.summary(responses, survey.questions.length)}</div>
                <div>{t.createdBy(shortAddress(survey.creator))}</div>
                {detail && (
                    <div>
                        <a
                            href={`${EXPLORER}/address/${friendlyAddress(survey.address)}`}
                            target="_blank"
                            rel="noreferrer"
                            title={friendlyAddress(survey.address)}
                        >
                            {t.surveyContract(shortAddress(survey.address))}
                        </a>
                    </div>
                )}
                {survey.rewardPerCompletion > 0n ? (
                    <>
                        <div>{t.rewardPer(formatTon(survey.rewardPerCompletion))}</div>
                        <div>{t.poolLeft(formatTon(survey.rewardPool), paidLeft?.toString() ?? '0')}</div>
                    </>
                ) : (
                    <div>{t.noReward}</div>
                )}
            </div>

            {survey.isOpen && rewardBelowCost && (
                <p className="notice error">{t.rewardBelowCost(formatTon(ANSWER_COST))}</p>
            )}
            {hasAnswered && <p className="notice">{t.alreadyAnswered}</p>}
            {detail && !showResults && !canAnswer && <p className="muted">{t.resultsHidden}</p>}
            {detail && canAnswer && (
                <>
                    <p className="muted">
                        {t.answerCost(formatTon(estimateSubmitValue(answers)), formatTon(STORAGE_DEPOSIT))}
                    </p>
                    {problems.length > 0 && (
                        <ul className="problems">
                            {problems.map((problem) => (
                                <li key={problem}>{problem}</li>
                            ))}
                        </ul>
                    )}
                    <button type="button" className="primary full-width" onClick={submit}>
                        {t.submitAnswers}
                    </button>
                </>
            )}
            {!detail && survey.isOpen && !hasAnswered && (
                <p className="muted">
                    <a href={surveyHash(survey.id)}>{t.submitAnswers} →</a>
                </p>
            )}

            {isCreator && survey.isOpen && (
                <button
                    type="button"
                    className="danger full-width"
                    disabled={!canAct}
                    onClick={() => send(survey.address, closeSurveyBody(), CLOSE_VALUE, t.closeTxLabel(survey.id))}
                >
                    {t.closeButton}
                </button>
            )}
        </article>
    );
}

function ChoiceInput({
    question,
    value,
    onChange,
}: {
    question: ChoiceQuestion;
    value: number[];
    onChange: (answer: number[]) => void;
}) {
    const single = question.maxSelect === 1;
    const full = value.length >= question.maxSelect;

    const toggle = (oi: number) => {
        if (value.includes(oi)) {
            onChange(value.filter((v) => v !== oi));
        } else if (single) {
            onChange([oi]);
        } else if (!full) {
            onChange([...value, oi].sort((a, b) => a - b));
        }
    };

    return (
        <ul className="choices">
            {question.options.map((option, oi) => {
                const selected = value.includes(oi);
                return (
                    <li key={oi}>
                        <button
                            type="button"
                            className={`choice${selected ? ' selected' : ''}${single ? '' : ' multi'}`}
                            aria-pressed={selected}
                            disabled={!single && !selected && full}
                            onClick={() => toggle(oi)}
                        >
                            <span className="choice-mark" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="14" height="14">
                                    <path
                                        d="M5 12l5 5L20 7"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </span>
                            {option}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

function TextInput({
    question,
    value,
    onChange,
}: {
    question: TextQuestion;
    value: string;
    onChange: (answer: string) => void;
}) {
    const { t } = useI18n();
    const chars = countChars(value);

    return (
        <div className="text-answer">
            <textarea
                rows={question.maxChars > 80 ? 3 : 1}
                value={value}
                placeholder={t.textPlaceholder}
                onChange={(e) =>
                    // Phone keyboards insert ’ “ … on their own; letters-only questions get plain ASCII instead.
                    onChange(
                        question.asciiOnly
                            ? toPlainPunctuation(e.target.value).replace(/\r?\n/g, ' ')
                            : e.target.value,
                    )
                }
            />
            <small className={chars > question.maxChars ? 'char-count over' : 'char-count'}>
                {chars}/{question.maxChars}
            </small>
        </div>
    );
}

function ChoiceResults({ question, responses }: { question: ChoiceQuestion; responses: number }) {
    const { t } = useI18n();
    return (
        <ul className="results">
            {question.options.map((option, oi) => {
                const votes = question.votes[oi] ?? 0;
                // Percent of respondents: with multi-select the options can add up to more than 100%.
                const percent = responses > 0 ? Math.round((votes / responses) * 100) : 0;
                return (
                    <li key={oi} className="result-row">
                        <div className="result-body">
                            <div className="result-label">
                                <span>{option}</span>
                                <span className="muted">{t.votes(votes, percent)}</span>
                            </div>
                            <div className="bar">
                                <div className="bar-fill" style={{ width: `${percent}%` }} />
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function TextResults({ survey, qi, myIndex }: { survey: Survey; qi: number; myIndex: number | undefined }) {
    const { t } = useI18n();
    const written = survey.responses
        .filter((r) => (r.answers[qi] as string).length > 0)
        .sort((a, b) => b.index - a.index);

    return (
        <div className="text-results">
            <p className="muted">{t.textAnswers(written.length)}</p>
            {written.length === 0 ? (
                <p className="muted">{t.noTextAnswers}</p>
            ) : (
                <ul>
                    {written.map((r) => (
                        <li key={r.index} className={r.index === myIndex ? 'mine' : ''}>
                            <p>{r.answers[qi] as string}</p>
                            <small className="muted">
                                {shortAddress(r.respondent)}
                                {r.index === myIndex ? ` · ${t.you}` : ''}
                            </small>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ShareButton({ surveyId, text }: { surveyId: number; text: string }) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);

    const share = async () => {
        const url = surveyUrl(surveyId);
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
