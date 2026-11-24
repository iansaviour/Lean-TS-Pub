import { CHAIN } from '@tonconnect/ui-react';

export type Network = 'testnet' | 'mainnet';

// The network the contract is deployed on. Everything network-specific below follows from it.
export const NETWORK = 'testnet' as Network;

// Address of the deployed SurveyDApp MASTER (factory) from Learn-TS-TON/survey_dapp on NETWORK.
// Each survey lives in its own Survey contract, deployed by this master.
// Fill this in after `npx blueprint run deploySurveyDApp --testnet`.
export const CONTRACT_ADDRESS = 'kQAgqXn0NO8P_aUvnaii9at8yZt-qUKMJ4gaC5KWwKDIH7ge';

const IS_TESTNET = NETWORK === 'testnet';

export const NETWORK_CHAIN = IS_TESTNET ? CHAIN.TESTNET : CHAIN.MAINNET;
export const NETWORK_LABEL = `TON ${NETWORK}`;
export const OTHER_NETWORK: Network = IS_TESTNET ? 'mainnet' : 'testnet';
export const TONCENTER_V3 = IS_TESTNET ? 'https://testnet.toncenter.com/api/v3' : 'https://toncenter.com/api/v3';
export const EXPLORER = IS_TESTNET ? 'https://testnet.tonscan.org' : 'https://tonscan.org';

// The wallet downloads this file itself, so it has to be the public HTTPS copy.
export const MANIFEST_URL = 'https://iansaviour.github.io/Lean-TS-Pub/survey/tonconnect-manifest.json';
