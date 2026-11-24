import type { ContractState } from './contract';
import { formatTon } from './contract';
import { CREATE_FEE, MIN_SUBMIT_VALUE, STORAGE_DEPOSIT } from './survey';
import { useI18n } from './i18n';
import type { Page } from './SurveyApp';

type Props = {
    state: ContractState | null;
    walletConnected: boolean;
    go: (page: Page) => void;
};

export default function Home({ state, walletConnected, go }: Props) {
    const { t } = useI18n();
    const ready = state?.kind === 'ready';
    const surveys = ready ? state.surveys : [];
    const open = surveys.filter((s) => s.isOpen).length;
    const responses = surveys.reduce((sum, s) => sum + s.responses.length, 0);

    const stats = [
        { value: surveys.length, label: t.statSurveys },
        { value: open, label: t.statOpen },
        { value: responses, label: t.statResponses },
    ];

    const steps = [
        { title: t.stepCreateTitle, text: t.stepCreate(formatTon(CREATE_FEE)) },
        { title: t.stepAnswerTitle, text: t.stepAnswer(formatTon(MIN_SUBMIT_VALUE), formatTon(STORAGE_DEPOSIT)) },
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
