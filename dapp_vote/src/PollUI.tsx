import { useCallback, useEffect, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { beginCell } from '@ton/core';

const contractAddress = 'kQAHdlp6UDGAS6yJwQmuJ4l3l5zoOwa020j-Mll2xgW5cRh9';

type VoteCounts = {
    yes: number;
    no: number;
};

function stackNumber(item: unknown): number {
    if (!Array.isArray(item) || item[0] !== 'num' || typeof item[1] !== 'string') {
        throw new Error('get_votes returned an unexpected value.');
    }
    return Number(BigInt(item[1]));
}

export default function PollUI() {
    const userAddress = useTonAddress();
    const [tonConnectUI] = useTonConnectUI();
    const [counts, setCounts] = useState<VoteCounts | null>(null);
    const [status, setStatus] = useState('Reading the contract…');

    const refresh = useCallback(async () => {
        const response = await fetch('https://testnet.toncenter.com/api/v2/runGetMethod', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ address: contractAddress, method: 'get_votes', stack: [] }),
        });
        const body = await response.json();
        const exitCode = body.result?.exit_code;
        if (!body.ok || exitCode !== 0) {
            setCounts(null);
            if (exitCode === 9) {
                setStatus('Data cell is empty.');
                return;
            }
            throw new Error(
                typeof exitCode === 'number'
                    ? `get_votes failed with exit code ${exitCode}.`
                    : 'get_votes could not be called.',
            );
        }
        const stack = body.result?.stack;
        if (!Array.isArray(stack) || stack.length < 2) {
            throw new Error('get_votes did not return two numbers.');
        }
        setCounts({ yes: stackNumber(stack[0]), no: stackNumber(stack[1]) });
        setStatus('Counts come from get_votes().');
    }, []);

    useEffect(() => {
        let active = true;
        const run = () => {
            refresh().catch((error: unknown) => {
                if (!active) return;
                setStatus(error instanceof Error ? error.message : 'The contract state could not be read.');
            });
        };
        run();
        const timer = setInterval(run, 12_000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [refresh]);

    const handleVote = async (opCode: number) => {
        if (!userAddress) return;

        const body = beginCell()
            .storeUint(opCode, 32)
            .endCell();

        const transaction = {
            validUntil: Math.floor(Date.now() / 1000) + 360,
            network: '-3',
            messages: [
                {
                    address: contractAddress,
                    amount: '10000000',
                    payload: body.toBoc().toString('base64'),
                },
            ],
        };

        try {
            setStatus('Waiting for the wallet…');
            await tonConnectUI.sendTransaction(transaction);
            setStatus('Vote sent. Reading the contract again…');
            window.setTimeout(() => {
                refresh().catch((error: unknown) => {
                    setStatus(error instanceof Error ? error.message : 'The contract state could not be read.');
                });
            }, 8_000);
        } catch (error) {
            console.error('Transaction failed or was canceled:', error);
            setStatus('The vote was not sent.');
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Online Questionnaire</h2>
                <TonConnectButton />
            </header>

            <section style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                <div style={{ minWidth: '120px', padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
                    <div>Yes</div>
                    <strong style={{ fontSize: '2rem' }}>{counts ? counts.yes : '—'}</strong>
                </div>
                <div style={{ minWidth: '120px', padding: '1rem', backgroundColor: '#ffebee', borderRadius: '8px' }}>
                    <div>No</div>
                    <strong style={{ fontSize: '2rem' }}>{counts ? counts.no : '—'}</strong>
                </div>
            </section>
            <p style={{ marginTop: '1rem', textAlign: 'center' }}>{status}</p>

            <main style={{ marginTop: '2rem', textAlign: 'center' }}>
                {userAddress ? (
                    <div>
                        <h3>Do you agree with the proposed changes?</h3>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                            <button
                                onClick={() => handleVote(1)}
                                style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                            >
                                Vote YES
                            </button>
                            <button
                                onClick={() => handleVote(2)}
                                style={{ padding: '10px 20px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                            >
                                Vote NO
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '2rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                        <p>Please connect your wallet to access the questionnaire.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
