import { Address, Cell } from '@ton/core';
import { NETWORK, TONCENTER_V3 } from './config';
import { parseMaster, parseSurvey, surveyAddress } from './survey';
import type { Survey } from './survey';

export type ContractState =
    | { kind: 'missing' }
    | { kind: 'empty-data' }
    | { kind: 'not-survey' }
    | { kind: 'ready'; owner: Address; surveyCount: number; surveys: Survey[] };

// ---------------------------------------------------------------------------
// Reading from TON Center v3 (one batched request for many accounts)
// ---------------------------------------------------------------------------

type AccountState = { status: string; data: Cell | null };

const BATCH = 100;

async function readAccounts(addresses: Address[]): Promise<Map<string, AccountState>> {
    const result = new Map<string, AccountState>();
    for (let i = 0; i < addresses.length; i += BATCH) {
        const params = new URLSearchParams({ include_boc: 'true' });
        for (const address of addresses.slice(i, i + BATCH)) {
            params.append('address', address.toRawString());
        }
        const response = await fetch(`${TONCENTER_V3}/accountStates?${params}`);
        if (!response.ok) {
            throw new Error(`TON Center did not answer (${response.status}).`);
        }
        const body = (await response.json()) as {
            accounts?: { address: string; status: string; data_boc?: string | null }[];
        };
        for (const account of body.accounts ?? []) {
            result.set(Address.parse(account.address).toRawString(), {
                status: account.status,
                data: account.data_boc ? Cell.fromBase64(account.data_boc) : null,
            });
        }
    }
    return result;
}

/** Reads the master, derives every survey address from its stored survey code, then reads all surveys in batches. */
export async function readContract(masterText: string): Promise<ContractState> {
    const master = Address.parse(masterText);
    const masterState = (await readAccounts([master])).get(master.toRawString());
    if (!masterState || masterState.status !== 'active' || !masterState.data) {
        return { kind: 'missing' };
    }
    if (masterState.data.bits.length === 0) {
        return { kind: 'empty-data' };
    }

    const parsed = parseMaster(masterState.data);
    if (!parsed) {
        return { kind: 'not-survey' };
    }

    const addresses = Array.from({ length: parsed.surveyCount }, (_, id) =>
        surveyAddress(master, parsed.surveyCode, id),
    );
    const accounts = await readAccounts(addresses);

    const surveys: Survey[] = [];
    addresses.forEach((address, id) => {
        const account = accounts.get(address.toRawString());
        if (account?.status !== 'active' || !account.data) return;
        const survey = parseSurvey(id, address, account.data);
        if (survey) surveys.push(survey);
    });
    surveys.sort((a, b) => b.id - a.id);

    return { kind: 'ready', owner: parsed.owner, surveyCount: parsed.surveyCount, surveys };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatTon(value: bigint): string {
    const whole = value / 1_000_000_000n;
    const fraction = (value % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function friendlyAddress(address: Address): string {
    return address.toString({ testOnly: NETWORK === 'testnet', bounceable: true });
}

export function shortAddress(address: Address): string {
    const text = address.toString({ testOnly: NETWORK === 'testnet', bounceable: false });
    return `${text.slice(0, 6)}…${text.slice(-6)}`;
}
