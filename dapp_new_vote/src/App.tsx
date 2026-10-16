import { useEffect } from 'react';
import { CHAIN, TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import { MANIFEST_URL } from './config';
import Questionnaire from './Questionnaire';

function TestnetConnection() {
  const [tonConnectUI] = useTonConnectUI();

  useEffect(() => {
    tonConnectUI.setConnectionNetwork(CHAIN.TESTNET);
  }, [tonConnectUI]);

  return null;
}

export default function App() {
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <TestnetConnection />
      <Questionnaire />
    </TonConnectUIProvider>
  );
}
