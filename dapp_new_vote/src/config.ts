import { toNano } from '@ton/core';

// Address of the deployed vote_d_app.fc on testnet. Fill this in after deploying.
export const CONTRACT_ADDRESS = '';

export const TONCENTER = 'https://testnet.toncenter.com/api/v2';

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
