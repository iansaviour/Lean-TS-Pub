import { Address, beginCell, Cell, contractAddress, Dictionary } from '@ton/core';
import type { DictionaryValue, Slice } from '@ton/core';
import { MAX_OPTIONS, NETWORK, TONCENTER_V3 } from './config';

// Master (VoteDApp) ops
const OP_CREATE_SET = 1;
// QuestionSet ops (sent straight to the set's own contract)
const OP_ANSWER = 2;
const OP_CLOSE_SET = 4;

export type QuestionItem = {
    index: number;
    text: string;
    options: string[];
    votes: number[];
};

export type QuestionnaireSet = {
    id: number;
    /** Address of this set's own QuestionSet contract. */
    address: Address;
    creator: Address;
    rewardPerCompletion: bigint;
    rewardPool: bigint;
    isOpen: boolean;
    questions: QuestionItem[];
    /** voterKey() of every wallet that completed this set. */
    answered: Set<bigint>;
};

export type ContractState =
    | { kind: 'missing' }
    | { kind: 'empty-data' }
    | { kind: 'ready'; owner: Address; setCount: number; sets: QuestionnaireSet[] };

export type QuestionDraft = {
    text: string;
    options: string[];
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function byteLength(text: string): number {
    return encoder.encode(text).length;
}

const emptyValue: DictionaryValue<true> = {
    serialize: () => {},
    parse: () => true,
};

function readText(slice: Slice, bytes: number): string {
    return decoder.decode(slice.loadBuffer(bytes));
}

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

// ---------------------------------------------------------------------------
// Set contract address: same StateInit the master builds in set_state_init()
// ---------------------------------------------------------------------------

/** Pre-init data; must match pack_set_data() in contracts/imports/questionnaire.fc */
function setInitData(master: Address, setId: number): Cell {
    return beginCell()
        .storeAddress(master)
        .storeUint(setId, 32)
        .storeAddress(null)
        .storeCoins(0)
        .storeCoins(0)
        .storeUint(0, 1)
        .storeUint(0, 8)
        .storeMaybeRef(null)
        .storeMaybeRef(null)
        .endCell();
}

export function setAddress(master: Address, setCode: Cell, setId: number): Address {
    return contractAddress(0, { code: setCode, data: setInitData(master, setId) });
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseQuestionItem(index: number, cell: Cell): QuestionItem {
    const s = cell.beginParse();
    const optionCount = s.loadUint(8);

    const textSlice = s.loadRef().beginParse();
    const text = readText(textSlice, textSlice.remainingBits / 8);

    const optionsSlice = s.loadRef().beginParse();
    const storedCount = optionsSlice.loadUint(8);
    const options: string[] = [];
    for (let i = 0; i < storedCount; i++) {
        options.push(readText(optionsSlice, optionsSlice.loadUint(8)));
    }

    const votesSlice = s.loadRef().beginParse();
    const votes: number[] = [];
    for (let i = 0; i < MAX_OPTIONS; i++) {
        votes.push(votesSlice.loadUint(32));
    }

    return { index, text, options, votes: votes.slice(0, optionCount) };
}

/** Returns null while the set contract is deployed but not initialised yet. */
function parseSet(id: number, address: Address, data: Cell): QuestionnaireSet | null {
    const s = data.beginParse();
    s.loadAddress(); // master
    s.loadUint(32); // set_id
    const creator = s.loadMaybeAddress();
    const rewardPerCompletion = s.loadCoins();
    const rewardPool = s.loadCoins();
    const isOpen = s.loadUint(1) === 1;
    const questionCount = s.loadUint(8);
    const questionDict = s.loadDict(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
    const answeredDict = s.loadDict(Dictionary.Keys.BigUint(256), emptyValue);

    if (!creator || questionCount === 0) return null;

    const questions: QuestionItem[] = [];
    for (let i = 0; i < questionCount; i++) {
        const q = questionDict.get(i);
        if (!q) throw new Error(`Set #${id} is missing question ${i}.`);
        questions.push(parseQuestionItem(i, q));
    }

    return {
        id,
        address,
        creator,
        rewardPerCompletion,
        rewardPool,
        isOpen,
        questions,
        answered: new Set(answeredDict.keys()),
    };
}

/** Reads the master, derives every set address from its stored set code, then reads all sets in batches. */
export async function readContract(masterText: string): Promise<ContractState> {
    const master = Address.parse(masterText);
    const masterState = (await readAccounts([master])).get(master.toRawString());
    if (!masterState || masterState.status !== 'active' || !masterState.data) {
        return { kind: 'missing' };
    }

    const ds = masterState.data.beginParse();
    if (ds.remainingBits === 0) {
        return { kind: 'empty-data' };
    }
    if (ds.remainingRefs !== 1) {
        throw new Error('This address is not a VoteDApp master (factory) contract.');
    }

    const owner = ds.loadAddress();
    const setCount = ds.loadUint(32);
    const setCode = ds.loadRef();

    const addresses = Array.from({ length: setCount }, (_, id) => setAddress(master, setCode, id));
    const accounts = await readAccounts(addresses);

    const sets: QuestionnaireSet[] = [];
    addresses.forEach((address, id) => {
        const account = accounts.get(address.toRawString());
        if (account?.status !== 'active' || !account.data) return;
        const set = parseSet(id, address, account.data);
        if (set) sets.push(set);
    });
    sets.sort((a, b) => b.id - a.id);

    return { kind: 'ready', owner, setCount, sets };
}

/** Same key as the set contract's answered dict: slice_hash(voter address). */
export function voterKey(voter: Address): bigint {
    const hash = beginCell().storeAddress(voter).endCell().hash();
    return BigInt(`0x${hash.toString('hex')}`);
}

// ---------------------------------------------------------------------------
// Message bodies
// ---------------------------------------------------------------------------

function textCell(text: string): Cell {
    return beginCell().storeBuffer(Buffer.from(encoder.encode(text))).endCell();
}

function optionsCell(options: string[]): Cell {
    const builder = beginCell().storeUint(options.length, 8);
    for (const option of options) {
        const bytes = Buffer.from(encoder.encode(option));
        builder.storeUint(bytes.length, 8).storeBuffer(bytes);
    }
    return builder.endCell();
}

function draftCell(draft: QuestionDraft): Cell {
    return beginCell().storeRef(textCell(draft.text)).storeRef(optionsCell(draft.options)).endCell();
}

/** Sent to the master. The master deploys a new QuestionSet contract for it. */
export function createSetBody(drafts: QuestionDraft[], rewardPerCompletion: bigint): Cell {
    const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
    drafts.forEach((draft, i) => {
        dict.set(i, draftCell(draft));
    });

    return beginCell()
        .storeUint(OP_CREATE_SET, 32)
        .storeCoins(rewardPerCompletion)
        .storeUint(drafts.length, 8)
        .storeRef(beginCell().storeDictDirect(dict).endCell())
        .endCell();
}

/** Sent to the set's own address. */
export function answerBody(choices: number[]): Cell {
    const builder = beginCell().storeUint(OP_ANSWER, 32);
    for (const choice of choices) {
        builder.storeUint(choice, 8);
    }
    return builder.endCell();
}

/** Sent to the set's own address. */
export function closeSetBody(): Cell {
    return beginCell().storeUint(OP_CLOSE_SET, 32).endCell();
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

/** Completions ≈ votes on the first question (each completion casts one vote per question). */
export function completionCount(set: QuestionnaireSet): number {
    if (set.questions.length === 0) return 0;
    return set.questions[0].votes.reduce((sum, v) => sum + v, 0);
}
