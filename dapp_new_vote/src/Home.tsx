import type { ContractState } from './contract';
import { formatTon } from './contract';
import { ANSWER_VALUE, CREATE_FEE } from './config';
import { useI18n } from './i18n';
import type { Page } from './Questionnaire';

type Props = {
    state: ContractState | null;
    walletConnected: boolean;
    go: (page: Page) => void;
};

export default function Home({ state, walletConnected, go }: Props) {
    const { t } = useI18n();
    const ready = state?.kind === 'ready';
    const questions = ready ? state.questions : [];
    const open = questions.filter((q) => q.isOpen).length;
    const answers = questions.reduce((sum, q) => sum + q.votes.reduce((a, v) => a + v, 0), 0);

    const stats = [
        { value: questions.length, label: t.statQuestions },
        { value: open, label: t.statOpen },
        { value: answers, label: t.statAnswers },
    ];

    const steps = [
        { title: t.stepCreateTitle, text: t.stepCreate(formatTon(CREATE_FEE), formatTon(ANSWER_VALUE)) },
        { title: t.stepAnswerTitle, text: t.stepAnswer(formatTon(ANSWER_VALUE)) },
        { title: t.stepCloseTitle, text: t.stepClose },
    ];

    return (
        <div className="home">
            <section className="home-hero">
                <p className="home-kicker">{t.heroKicker}</p>
                <h2 className="home-title">
                    {t.heroTitle.map((line, i) => (
                        <span key={line} className={i === t.heroTitle.length - 1 ? 'accent' : ''}>
                            {line}
                        </span>
                    ))}
                </h2>
                <div className="home-intro">
                    <p>{t.intro}</p>
                    {!walletConnected && <p className="home-hint">{t.connectHint}</p>}
                </div>
                <div className="home-actions">
                    <button type="button" className="home-button solid" onClick={() => go('create')}>
                        {t.goCreate} <span aria-hidden="true">→</span>
                    </button>
                    <button type="button" className="home-button outline" onClick={() => go('list')}>
                        {t.goList}
                    </button>
                </div>
            </section>

            <section className="home-section">
                <h3 className="home-label">{t.statsLabel}</h3>
                <div className="home-stats">
                    {stats.map((stat) => (
                        <div className="home-stat" key={stat.label}>
                            <strong>{ready ? stat.value : '—'}</strong>
                            <span>{stat.label}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="home-section">
                <h3 className="home-label">{t.howItWorks}</h3>
                <ol className="home-steps">
                    {steps.map((step, i) => (
                        <li key={step.title}>
                            <span className="home-step-number">{String(i + 1).padStart(2, '0')}</span>
                            <div>
                                <strong>{step.title}</strong>
                                <p>{step.text}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>
        </div>
    );
}
