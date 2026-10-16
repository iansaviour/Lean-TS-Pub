import { toNano } from '@ton/core';
import { CHAIN } from '@tonconnect/ui-react';

export type Network = 'testnet' | 'mainnet';

// The network the contract is deployed on. Everything network-specific below follows from it.
export const NETWORK = 'testnet' as Network;

// Address of the deployed vote_d_app.fc on NETWORK. Fill this in after deploying.
export const CONTRACT_ADDRESS = 'kQC4T4DOHeGDnF8fps8cb4cnE8oe-FV5c6MKotb7en7g2d5z';

const IS_TESTNET = NETWORK === 'testnet';

export const NETWORK_CHAIN = IS_TESTNET ? CHAIN.TESTNET : CHAIN.MAINNET;
export const NETWORK_LABEL = `TON ${NETWORK}`;
export const OTHER_NETWORK: Network = IS_TESTNET ? 'mainnet' : 'testnet';
export const TONCENTER = IS_TESTNET ? 'https://testnet.toncenter.com/api/v2' : 'https://toncenter.com/api/v2';
export const EXPLORER = IS_TESTNET ? 'https://testnet.tonscan.org' : 'https://tonscan.org';

// The wallet downloads this file itself, so it has to be the public HTTPS copy.
export const MANIFEST_URL = 'https://iansaviour.github.io/Lean-TS-Pub/new-vote/tonconnect-manifest.json';

// Must match vote_d_app.fc.
export const CREATE_FEE = toNano('0.05');
export const MIN_ANSWER_VALUE = toNano('0.02');
export const MAX_QUESTION_BYTES = 100;
export const MAX_OPTION_BYTES = 20;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;

// Attached to answer and close messages. The contract returns what it does not spend.
export const ANSWER_VALUE = toNano('0.03');
export const CLOSE_VALUE = toNano('0.05');
