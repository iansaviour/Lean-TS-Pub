import { useEffect } from 'react';
import { CHAIN, TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import PollUI from './PollUI';

// The wallet downloads this file itself. It must be public HTTPS.
// localhost returns "App manifest not found" (TonConnect error code 2).
const manifestUrl = 'https://iansaviour.github.io/Lean-TS-Pub/vote/tonconnect-manifest.json';

function TestnetConnection() {
  const [tonConnectUI] = useTonConnectUI();

  useEffect(() => {
    tonConnectUI.setConnectionNetwork(CHAIN.TESTNET);
  }, [tonConnectUI]);

  return null;
}

function App() {
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <TestnetConnection />
      <PollUI />
    </TonConnectUIProvider>
  );
}

export default App;
