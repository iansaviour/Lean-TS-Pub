import { useEffect } from 'react';
import { CHAIN, TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import { MANIFEST_URL } from './config';
import { I18nProvider } from './i18n';
import Questionnaire from './Questionnaire';

function TestnetConnection() {
    const [tonConnectUI] = useTonConnectUI();

    useEffect(() => {
        if (tonConnectUI.connected) return;
        try {
            tonConnectUI.setConnectionNetwork(CHAIN.TESTNET);
        } catch {
            // TonConnect refuses to change network while a wallet is connected.
        }
    }, [tonConnectUI]);

    return null;
}

export default function App() {
    return (
        <I18nProvider>
            <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
                <TestnetConnection />
                <Questionnaire />
            </TonConnectUIProvider>
        </I18nProvider>
    );
}
