import { Address, beginCell, Cell, Dictionary } from '@ton/core';
import type { DictionaryValue, Slice } from '@ton/core';
import { MAX_OPTIONS, NETWORK, TONCENTER } from './config';

const OP_CREATE_SET = 1;
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
    creator: Address;
    rewardPerCompletion: bigint;
    rewardPool: bigint;
    isOpen: boolean;
    questions: QuestionItem[];
};

export type ContractState =
    | { kind: 'missing' }
    | { kind: 'empty-data' }
    | { kind: 'ready'; owner: Address; sets: QuestionnaireSet[]; answered: Set<bigint> };

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

function parseSet(id: number, cell: Cell): QuestionnaireSet {
    const s = cell.beginParse();
    const creator = s.loadAddress();
    const rewardPerCompletion = s.loadCoins();
    const rewardPool = s.loadCoins();
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
        creator,
        rewardPerCompletion,
        rewardPool,
        isOpen,
        questions,
    };
}

export async function readContract(address: string): Promise<ContractState> {
    const response = await fetch(`${TONCENTER}/getAddressInformation?address=${encodeURIComponent(address)}`);
    const body = await response.json();
    if (!body.ok) {
        throw new Error(typeof body.result === 'string' ? body.result : 'TON Center did not answer.');
    }
    if (body.result.state !== 'active' || !body.result.data) {
        return { kind: 'missing' };
    }

    const data = Cell.fromBase64(body.result.data).beginParse();
    if (data.remainingBits === 0) {
        return { kind: 'empty-data' };
    }

    const owner = data.loadAddress();
    data.loadUint(32);
    const setDict = data.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell());
    const answeredDict = data.loadDict(Dictionary.Keys.BigUint(256), emptyValue);

    const sets = setDict
        .keys()
        .map((id) => parseSet(id, setDict.get(id)!))
        .sort((a, b) => b.id - a.id);

    return { kind: 'ready', owner, sets, answered: new Set(answeredDict.keys()) };
}

// Same key as answer_key() in the contract: hash of (set_id:uint32, voter address).
export function answerKey(setId: number, voter: Address): bigint {
    const hash = beginCell().storeUint(setId, 32).storeAddress(voter).endCell().hash();
    return BigInt(`0x${hash.toString('hex')}`);
}

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

export function answerBody(setId: number, choices: number[]): Cell {
    const builder = beginCell().storeUint(OP_ANSWER, 32).storeUint(setId, 32);
    for (const choice of choices) {
        builder.storeUint(choice, 8);
    }
    return builder.endCell();
}

export function closeSetBody(setId: number): Cell {
    return beginCell().storeUint(OP_CLOSE_SET, 32).storeUint(setId, 32).endCell();
}

export function formatTon(value: bigint): string {
    const whole = value / 1_000_000_000n;
    const fraction = (value % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : `${whole}`;
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
