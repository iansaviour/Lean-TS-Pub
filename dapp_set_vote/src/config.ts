import { toNano } from '@ton/core';
import { CHAIN } from '@tonconnect/ui-react';

export type Network = 'testnet' | 'mainnet';

// The network the contracts are deployed on. Everything network-specific below follows from it.
// The master address is not configured here: contract.ts derives it from the code in codes.ts.
export const NETWORK = 'testnet' as Network;

const IS_TESTNET = NETWORK === 'testnet';

export const NETWORK_CHAIN = IS_TESTNET ? CHAIN.TESTNET : CHAIN.MAINNET;
export const NETWORK_LABEL = `TON ${NETWORK}`;
export const OTHER_NETWORK: Network = IS_TESTNET ? 'mainnet' : 'testnet';
export const TONCENTER_V3 = IS_TESTNET ? 'https://testnet.toncenter.com/api/v3' : 'https://toncenter.com/api/v3';
export const EXPLORER = IS_TESTNET ? 'https://testnet.tonscan.org' : 'https://tonscan.org';

// The wallet downloads this file itself, so it has to be the public HTTPS copy.
export const MANIFEST_URL = 'https://iansaviour.github.io/Lean-TS-Pub/set-vote/tonconnect-manifest.json';

// Must match scalable_vote/common.fc.
export const CREATE_FEE = toNano('0.05');
export const MIN_ANSWER_VALUE = toNano('0.05');
export const RECEIPT_STORAGE = toNano('0.01');
export const MAX_QUESTION_BYTES = 100;
export const MAX_OPTION_BYTES = 20;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;
export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 5;

// Attached to answer and close messages. The contracts return what they do not spend,
// except RECEIPT_STORAGE, which stays on the answerer's receipt.
export const ANSWER_VALUE = toNano('0.06');
export const CLOSE_VALUE = toNano('0.05');
// Attached to the one-time master deploy; it stays on the master for storage.
export const DEPLOY_VALUE = toNano('0.05');
