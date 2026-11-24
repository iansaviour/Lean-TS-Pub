import { useEffect } from 'react';
import { TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import { MANIFEST_URL, NETWORK_CHAIN } from './config';
import { I18nProvider } from './i18n';
import SurveyApp from './SurveyApp';

function NetworkConnection() {
    const [tonConnectUI] = useTonConnectUI();

    useEffect(() => {
        if (tonConnectUI.connected) return;
        try {
            tonConnectUI.setConnectionNetwork(NETWORK_CHAIN);
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
                <NetworkConnection />
                <SurveyApp />
            </TonConnectUIProvider>
        </I18nProvider>
    );
}
