import { useCallback, useEffect, useMemo, useState } from 'react';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import type { Cell } from '@ton/core';
import { CONTRACT_ADDRESS, EXPLORER, NETWORK_CHAIN, NETWORK_LABEL } from './config';
import { friendlyAddress, readContract } from './contract';
import type { ContractState } from './contract';
import CreateSurvey from './CreateSurvey';
import Home from './Home';
import { LanguageSwitch, useI18n } from './i18n';
import type { Messages } from './messages';
import SurveyCard from './SurveyCard';

const REFRESH_MS = 15_000;
const AFTER_SEND_MS = 8_000;

/** `to` is the master for create, or the survey's own contract for submit / close. */
export type SendMessage = (to: Address, body: Cell, amount: bigint, label: string) => Promise<boolean>;

export type Page = 'home' | 'create' | 'list';

const PAGES: { id: Page; hash: string; label: (t: Messages) => string; icon: string }[] = [
    { id: 'home', hash: '#/', label: (t) => t.navHome, icon: '⌂' },
    { id: 'create', hash: '#/buat', label: (t) => t.navCreate, icon: '+' },
    { id: 'list', hash: '#/survei', label: (t) => t.navList, icon: '☰' },
];

type Route = { page: Page; surveyId: number | null };

const SURVEY_HASH = /^#\/survei\/(\d+)$/;

function routeFromHash(): Route {
    const match = SURVEY_HASH.exec(window.location.hash);
    if (match) {
        return { page: 'list', surveyId: Number(match[1]) };
    }
    const page = PAGES.find((item) => item.hash === window.location.hash)?.id ?? 'home';
    return { page, surveyId: null };
}

function useRoute(): [Route, (page: Page) => void] {
    const [route, setRoute] = useState<Route>(routeFromHash);

    useEffect(() => {
        const onHashChange = () => {
            setRoute(routeFromHash());
            window.scrollTo({ top: 0 });
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    const go = useCallback((next: Page) => {
        window.location.hash = PAGES.find((item) => item.id === next)!.hash;
    }, []);

    return [route, go];
}

export default function SurveyApp() {
    const [{ page, surveyId }, go] = useRoute();
    const { t } = useI18n();
    const [tonConnectUI] = useTonConnectUI();
    const wallet = useTonWallet();
    const [state, setState] = useState<ContractState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const walletAddress = useMemo(() => (wallet ? Address.parse(wallet.account.address) : null), [wallet]);
    const onNetwork = wallet?.account.chain === NETWORK_CHAIN;

    const refresh = useCallback(async () => {
        if (!CONTRACT_ADDRESS) return;
        try {
            setState(await readContract(CONTRACT_ADDRESS));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : '');
        }
    }, []);

    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, REFRESH_MS);
        return () => clearInterval(timer);
    }, [refresh]);

    const send: SendMessage = async (to, body, amount, label) => {
        if (!walletAddress || !onNetwork) return false;
        setBusy(true);
        setStatus(t.txWaiting(label));
        try {
            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 300,
                network: NETWORK_CHAIN,
                messages: [
                    {
                        address: friendlyAddress(to),
                        amount: amount.toString(),
                        payload: body.toBoc().toString('base64'),
                    },
                ],
            });
            setStatus(t.txSent(label));
            window.setTimeout(() => {
                refresh().then(() => setStatus(null));
            }, AFTER_SEND_MS);
            return true;
        } catch (err) {
            console.error(err);
            setStatus(t.txFailed(label));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const canAct = Boolean(walletAddress && onNetwork && state?.kind === 'ready') && !busy;

    return (
        <div className="page">
            <header className="header">
                <div>
                    <p className="eyebrow">{NETWORK_LABEL}</p>
                    <h1>{t.appTitle}</h1>
                </div>
                <div className="header-actions">
                    <LanguageSwitch />
                    <TonConnectButton />
                </div>
            </header>

            {wallet && !onNetwork && <p className="notice error">{t.wrongNetwork}</p>}
            {status && <p className="notice">{status}</p>}

            <ContractNotice state={state} error={error} />

            {page === 'home' && <Home state={state} walletConnected={Boolean(wallet)} go={go} />}

            {page === 'create' && state?.kind === 'ready' && (
                <CreateSurvey canAct={canAct} send={send} onCreated={() => go('list')} />
            )}

            {page === 'list' && surveyId !== null && state?.kind === 'ready' && (
                <SurveyDetail
                    surveyId={surveyId}
                    state={state}
                    walletAddress={walletAddress}
                    canAct={canAct}
                    send={send}
                />
            )}

            {page === 'list' && surveyId === null && state?.kind === 'ready' && (
                <section>
                    <h2>{t.listTitle(state.surveys.length)}</h2>
                    {state.surveys.length === 0 && (
                        <p className="muted">
                            {t.listEmpty}{' '}
                            <button type="button" className="link" onClick={() => go('create')}>
                                {t.listEmptyCta}
                            </button>
                        </p>
                    )}
                    {state.surveys.map((survey) => (
                        <SurveyCard
                            key={survey.id}
                            survey={survey}
                            walletAddress={walletAddress}
                            canAct={canAct}
                            send={send}
                        />
                    ))}
                </section>
            )}

            <footer className="footer muted">
                {CONTRACT_ADDRESS ? (
                    <a
                        href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
                        target="_blank"
                        rel="noreferrer"
                        title={CONTRACT_ADDRESS}
                    >
                        {t.contractAddress}
                    </a>
                ) : (
                    t.contractAddressMissing
                )}
            </footer>

            <nav className="bottom-nav">
                {PAGES.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={page === item.id ? 'active' : ''}
                        aria-current={page === item.id ? 'page' : undefined}
                        onClick={() => go(item.id)}
                    >
                        <span className="nav-icon" aria-hidden="true">
                            {item.icon}
                        </span>
                        <span>{item.label(t)}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
}

type DetailProps = {
    surveyId: number;
    state: Extract<ContractState, { kind: 'ready' }>;
    walletAddress: Address | null;
    canAct: boolean;
    send: SendMessage;
};

function SurveyDetail({ surveyId, state, walletAddress, canAct, send }: DetailProps) {
    const { t } = useI18n();
    const survey = state.surveys.find((s) => s.id === surveyId);

    return (
        <section>
            <a className="back-link" href={PAGES.find((item) => item.id === 'list')!.hash}>
                {t.backToList}
            </a>
            {survey ? (
                <SurveyCard survey={survey} walletAddress={walletAddress} canAct={canAct} send={send} detail />
            ) : (
                <p className="notice error">{t.notFound(surveyId)}</p>
            )}
        </section>
    );
}

function ContractNotice({ state, error }: { state: ContractState | null; error: string | null }) {
    const { t } = useI18n();
    if (!CONTRACT_ADDRESS) {
        return <p className="notice error">{t.noAddress}</p>;
    }
    if (error !== null) {
        return <p className="notice error">{error || t.readFailed}</p>;
    }
    if (!state) {
        return <p className="notice">{t.reading}</p>;
    }
    if (state.kind === 'missing') {
        return <p className="notice error">{t.missing}</p>;
    }
    if (state.kind === 'empty-data') {
        return <p className="notice error">{t.emptyData}</p>;
    }
    if (state.kind === 'not-survey') {
        return <p className="notice error">{t.notSurvey}</p>;
    }
    return null;
}
