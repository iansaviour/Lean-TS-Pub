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
    const questions = state?.kind === 'ready' ? state.questions : [];
    const open = questions.filter((q) => q.isOpen).length;
    const answers = questions.reduce((sum, q) => sum + q.votes.reduce((a, v) => a + v, 0), 0);

    return (
        <>
            <section className="card">
                <h2>{t.welcome}</h2>
                <p>{t.intro}</p>
                {!walletConnected && <p className="muted">{t.connectHint}</p>}
            </section>

            {state?.kind === 'ready' && (
                <section className="stats">
                    <div className="stat">
                        <strong>{questions.length}</strong>
                        <span>{t.statQuestions}</span>
                    </div>
                    <div className="stat">
                        <strong>{open}</strong>
                        <span>{t.statOpen}</span>
                    </div>
                    <div className="stat">
                        <strong>{answers}</strong>
                        <span>{t.statAnswers}</span>
                    </div>
                </section>
            )}

            <section className="card">
                <h2>{t.howItWorks}</h2>
                <ol className="steps">
                    <li>
                        <strong>{t.stepCreateTitle}</strong> {t.stepCreate(formatTon(CREATE_FEE), formatTon(ANSWER_VALUE))}
                    </li>
                    <li>
                        <strong>{t.stepAnswerTitle}</strong> {t.stepAnswer(formatTon(ANSWER_VALUE))}
                    </li>
                    <li>
                        <strong>{t.stepCloseTitle}</strong> {t.stepClose}
                    </li>
                </ol>
            </section>

            <div className="actions">
                <button type="button" className="primary" onClick={() => go('create')}>
                    {t.goCreate}
                </button>
                <button type="button" className="ghost" onClick={() => go('list')}>
                    {t.goList}
                </button>
            </div>
        </>
    );
}
