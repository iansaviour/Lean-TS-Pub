import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHAIN, TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import type { Cell } from '@ton/core';
import { CONTRACT_ADDRESS } from './config';
import { readContract } from './contract';
import type { ContractState } from './contract';
import CreateQuestion from './CreateQuestion';
import QuestionCard from './QuestionCard';

const REFRESH_MS = 15_000;
const AFTER_SEND_MS = 8_000;

export type SendMessage = (body: Cell, amount: bigint, label: string) => Promise<boolean>;

export default function Questionnaire() {
    const [tonConnectUI] = useTonConnectUI();
    const wallet = useTonWallet();
    const [state, setState] = useState<ContractState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const walletAddress = useMemo(
        () => (wallet ? Address.parse(wallet.account.address) : null),
        [wallet],
    );
    const onTestnet = wallet?.account.chain === CHAIN.TESTNET;

    const refresh = useCallback(async () => {
        if (!CONTRACT_ADDRESS) return;
        try {
            setState(await readContract(CONTRACT_ADDRESS));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Data kontrak gagal dibaca.');
        }
    }, []);

    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, REFRESH_MS);
        return () => clearInterval(timer);
    }, [refresh]);

    const send: SendMessage = async (body, amount, label) => {
        if (!walletAddress || !onTestnet) return false;
        setBusy(true);
        setStatus(`${label}: menunggu konfirmasi di wallet…`);
        try {
            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 300,
                network: CHAIN.TESTNET,
                messages: [
                    {
                        address: CONTRACT_ADDRESS,
                        amount: amount.toString(),
                        payload: body.toBoc().toString('base64'),
                    },
                ],
            });
            setStatus(`${label}: terkirim. Membaca kontrak lagi…`);
            window.setTimeout(() => {
                refresh().then(() => setStatus(null));
            }, AFTER_SEND_MS);
            return true;
        } catch (err) {
            console.error(err);
            setStatus(`${label}: dibatalkan atau gagal.`);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const canAct = Boolean(walletAddress && onTestnet && state?.kind === 'ready') && !busy;

    return (
        <div className="page">
            <header className="header">
                <div>
                    <p className="eyebrow">TON testnet</p>
                    <h1>Kuesioner TON</h1>
                </div>
                <TonConnectButton />
            </header>

            {wallet && !onTestnet && (
                <p className="notice error">Wallet terhubung ke mainnet. Pindahkan wallet ke testnet lalu hubungkan lagi.</p>
            )}
            {status && <p className="notice">{status}</p>}

            <ContractNotice state={state} error={error} />

            {state?.kind === 'ready' && (
                <>
                    <CreateQuestion canAct={canAct} send={send} />

                    <section>
                        <h2>Pertanyaan ({state.questions.length})</h2>
                        {state.questions.length === 0 && <p className="muted">Belum ada pertanyaan.</p>}
                        {state.questions.map((question) => (
                            <QuestionCard
                                key={question.id}
                                question={question}
                                answered={state.answered}
                                walletAddress={walletAddress}
                                canAct={canAct}
                                send={send}
                            />
                        ))}
                    </section>
                </>
            )}

            <footer className="footer muted">
                Kontrak:{' '}
                {CONTRACT_ADDRESS ? (
                    <a href={`https://testnet.tonscan.org/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
                        {CONTRACT_ADDRESS}
                    </a>
                ) : (
                    'belum diisi'
                )}
            </footer>
        </div>
    );
}

function ContractNotice({ state, error }: { state: ContractState | null; error: string | null }) {
    if (!CONTRACT_ADDRESS) {
        return <p className="notice error">Isi <code>CONTRACT_ADDRESS</code> di <code>src/config.ts</code> dengan alamat kontrak yang sudah di-deploy.</p>;
    }
    if (error) {
        return <p className="notice error">{error}</p>;
    }
    if (!state) {
        return <p className="notice">Membaca kontrak…</p>;
    }
    if (state.kind === 'missing') {
        return <p className="notice error">Belum ada kontrak aktif di alamat ini.</p>;
    }
    if (state.kind === 'empty-data') {
        return (
            <p className="notice error">
                Data awal kontrak kosong. Deploy ulang dengan data: alamat owner, <code>uint32 0</code>, lalu dua dictionary kosong.
            </p>
        );
    }
    return null;
}
