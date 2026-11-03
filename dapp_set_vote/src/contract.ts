import { Address, beginCell, Cell, contractAddress, Dictionary, storeStateInit } from '@ton/core';
import type { Slice, StateInit } from '@ton/core';
import { MASTER_CODE, RECEIPT_CODE, SET_CODE } from './codes';
import { MAX_OPTIONS, NETWORK, TONCENTER_V3 } from './config';

const OP_CREATE_SET = 1;
const OP_ANSWER = 2;
const OP_CLOSE_SET = 4;

// TON Center answers up to this many addresses in one accountStates request.
const BATCH = 100;
// Without an API key TON Center allows about one request per second.
const REQUEST_GAP_MS = 1_100;

export type QuestionItem = {
    index: number;
    text: string;
    options: string[];
    votes: number[];
};

export type QuestionnaireSet = {
    id: number;
    address: Address;
    creator: Address;
    rewardPerCompletion: bigint;
    rewardPool: bigint;
    pending: number;
    isOpen: boolean;
    questions: QuestionItem[];
};

export type ContractState =
    | { kind: 'missing' }
    | { kind: 'ready'; sets: QuestionnaireSet[]; answered: Set<number> };

export type QuestionDraft = {
    text: string;
    options: string[];
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function byteLength(text: string): number {
    return encoder.encode(text).length;
}

// -----------------------------------------
// Addresses
// -----------------------------------------
// Every address is the hash of a contract's code and initial data, so the page
// computes them itself instead of asking the chain.

const masterCode = Cell.fromBase64(MASTER_CODE);
const setCode = Cell.fromBase64(SET_CODE);
const receiptCode = Cell.fromBase64(RECEIPT_CODE);

// Same initial data as master.fc storage: next_set_id = 0, ^set_code, ^receipt_code
export const masterInit: StateInit = {
    code: masterCode,
    data: beginCell().storeUint(0, 32).storeRef(setCode).storeRef(receiptCode).endCell(),
};

export const MASTER_ADDRESS = contractAddress(0, masterInit);

// Same as set_init_data() in common.fc
export function setAddress(id: number): Address {
    return contractAddress(0, {
        code: setCode,
        data: beginCell()
            .storeAddress(MASTER_ADDRESS)
            .storeUint(id, 32)
            .storeRef(receiptCode)
            .storeUint(0, 1)
            .endCell(),
    });
}

// Same as receipt_init_data() in common.fc
export function receiptAddress(set: Address, voter: Address): Address {
    return contractAddress(0, {
        code: receiptCode,
        data: beginCell().storeAddress(set).storeAddress(voter).storeUint(0, 1).endCell(),
    });
}

export function stateInitBoc(init: StateInit): string {
    return beginCell().store(storeStateInit(init)).endCell().toBoc().toString('base64');
}

// -----------------------------------------
// Reading
// -----------------------------------------

type AccountData = { status: string; data: Cell | null };

let lastRequest = 0;

async function throttledFetch(url: string): Promise<Response> {
    const wait = lastRequest + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    return fetch(url);
}

// Accounts that were never deployed are left out of the answer, so they are missing from the map.
async function readAccounts(addresses: Address[]): Promise<Map<string, AccountData>> {
    const found = new Map<string, AccountData>();
    for (let i = 0; i < addresses.length; i += BATCH) {
        const query = addresses
            .slice(i, i + BATCH)
            .map((a) => `address=${encodeURIComponent(a.toRawString())}`)
            .join('&');
        const response = await throttledFetch(`${TONCENTER_V3}/accountStates?${query}&include_boc=true`);
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.accounts)) {
            throw new Error(typeof body.error === 'string' ? body.error : 'TON Center did not answer.');
        }
        for (const account of body.accounts) {
            found.set(Address.parse(account.address).toRawString(), {
                status: account.status,
                data: account.data_boc ? Cell.fromBase64(account.data_boc) : null,
            });
        }
    }
    return found;
}

function activeData(accounts: Map<string, AccountData>, address: Address): Cell | null {
    const account = accounts.get(address.toRawString());
    return account?.status === 'active' ? account.data : null;
}

function readText(slice: Slice, bytes: number): string {
    return decoder.decode(slice.loadBuffer(bytes));
}

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

    return {
        index,
        text,
        options,
        votes: votes.slice(0, optionCount),
    };
}

// Same order as save_data() in set.fc. Returns null until the master's init message arrived.
export function parseSet(id: number, address: Address, cell: Cell): QuestionnaireSet | null {
    const s = cell.beginParse();
    s.loadAddress(); // master
    s.loadUint(32); // set_id
    s.loadRef(); // receipt_code
    if (s.loadUint(1) === 0) return null;

    const creator = s.loadAddress();
    const rewardPerCompletion = s.loadCoins();
    const rewardPool = s.loadCoins();
    const pending = s.loadUint(32);
    const isOpen = s.loadUint(1) === 1;
    const questionCount = s.loadUint(8);
    const questionDict = s.loadDict(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());

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
        pending,
        isOpen,
        questions,
    };
}

/**
 * Master → set count, every set contract, then (with a wallet) every receipt of that wallet.
 * Three rounds of batched requests, no matter how many sets exist.
 */
export async function readContract(voter: Address | null): Promise<ContractState> {
    const masterAccounts = await readAccounts([MASTER_ADDRESS]);
    const masterData = activeData(masterAccounts, MASTER_ADDRESS);
    if (!masterData) {
        return { kind: 'missing' };
    }
    const setCount = masterData.beginParse().loadUint(32);

    const ids = Array.from({ length: setCount }, (_, i) => i);
    const addresses = ids.map(setAddress);
    const setAccounts = await readAccounts(addresses);

    const sets: QuestionnaireSet[] = [];
    ids.forEach((id) => {
        const data = activeData(setAccounts, addresses[id]);
        const set = data ? parseSet(id, addresses[id], data) : null;
        if (set) sets.push(set);
    });
    sets.sort((a, b) => b.id - a.id);

    const answered = new Set<number>();
    if (voter && sets.length > 0) {
        const receipts = sets.map((set) => receiptAddress(set.address, voter));
        const receiptAccounts = await readAccounts(receipts);
        sets.forEach((set, i) => {
            const data = activeData(receiptAccounts, receipts[i]);
            if (data && parseReceiptAnswered(data)) answered.add(set.id);
        });
    }

    return { kind: 'ready', sets, answered };
}

// Same order as save_data() in receipt.fc: set_address | voter | answered:uint1
function parseReceiptAnswered(cell: Cell): boolean {
    const s = cell.beginParse();
    s.loadAddress();
    s.loadAddress();
    return s.loadUint(1) === 1;
}

// -----------------------------------------
// Message bodies
// -----------------------------------------

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

/** Sent to the master. */
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

/** Sent to the set itself, so no set id. */
export function answerBody(choices: number[]): Cell {
    const builder = beginCell().storeUint(OP_ANSWER, 32);
    for (const choice of choices) {
        builder.storeUint(choice, 8);
    }
    return builder.endCell();
}

/** Sent to the set itself, so no set id. */
export function closeSetBody(): Cell {
    return beginCell().storeUint(OP_CLOSE_SET, 32).endCell();
}

// -----------------------------------------
// Display
// -----------------------------------------

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

/** Pool that isn't reserved by answers still on their way through a receipt. */
export function freePool(set: QuestionnaireSet): bigint {
    return set.rewardPool - BigInt(set.pending) * set.rewardPerCompletion;
}

/** Completions ≈ votes on the first question (each completion casts one vote per question). */
export function completionCount(set: QuestionnaireSet): number {
    if (set.questions.length === 0) return 0;
    return set.questions[0].votes.reduce((sum, v) => sum + v, 0);
}
