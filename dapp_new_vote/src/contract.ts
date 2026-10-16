import { Address, beginCell, Cell, Dictionary } from '@ton/core';
import type { DictionaryValue, Slice } from '@ton/core';
import { MAX_OPTIONS, TONCENTER } from './config';

const OP_CREATE_QUESTION = 1;
const OP_ANSWER = 2;
const OP_CLOSE_QUESTION = 4;

export type Question = {
    id: number;
    creator: Address;
    rewardPerAnswer: bigint;
    rewardPool: bigint;
    isOpen: boolean;
    text: string;
    options: string[];
    votes: number[];
};

export type ContractState =
    | { kind: 'missing' }
    | { kind: 'empty-data' }
    | { kind: 'ready'; owner: Address; questions: Question[]; answered: Set<bigint> };

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

function parseQuestion(id: number, cell: Cell): Question {
    const s = cell.beginParse();
    const creator = s.loadAddress();
    const rewardPerAnswer = s.loadCoins();
    const rewardPool = s.loadCoins();
    const isOpen = s.loadUint(1) === 1;
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
        id,
        creator,
        rewardPerAnswer,
        rewardPool,
        isOpen,
        text,
        options,
        votes: votes.slice(0, optionCount),
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
    const questionDict = data.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell());
    const answeredDict = data.loadDict(Dictionary.Keys.BigUint(256), emptyValue);

    const questions = questionDict
        .keys()
        .map((id) => parseQuestion(id, questionDict.get(id)!))
        .sort((a, b) => b.id - a.id);

    return { kind: 'ready', owner, questions, answered: new Set(answeredDict.keys()) };
}

// Same key as answer_key() in the contract: hash of (question_id:uint32, voter address).
export function answerKey(questionId: number, voter: Address): bigint {
    const hash = beginCell().storeUint(questionId, 32).storeAddress(voter).endCell().hash();
    return BigInt(`0x${hash.toString('hex')}`);
}

function textCell(text: string): Cell {
    return beginCell().storeBuffer(Buffer.from(encoder.encode(text))).endCell();
}

export function createQuestionBody(text: string, options: string[], rewardPerAnswer: bigint): Cell {
    const optionsBuilder = beginCell().storeUint(options.length, 8);
    for (const option of options) {
        const bytes = Buffer.from(encoder.encode(option));
        optionsBuilder.storeUint(bytes.length, 8).storeBuffer(bytes);
    }
    return beginCell()
        .storeUint(OP_CREATE_QUESTION, 32)
        .storeCoins(rewardPerAnswer)
        .storeRef(textCell(text))
        .storeRef(optionsBuilder.endCell())
        .endCell();
}

export function answerBody(questionId: number, choice: number): Cell {
    return beginCell()
        .storeUint(OP_ANSWER, 32)
        .storeUint(questionId, 32)
        .storeUint(choice, 8)
        .endCell();
}

export function closeQuestionBody(questionId: number): Cell {
    return beginCell()
        .storeUint(OP_CLOSE_QUESTION, 32)
        .storeUint(questionId, 32)
        .endCell();
}

export function formatTon(value: bigint): string {
    const whole = value / 1_000_000_000n;
    const fraction = (value % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function shortAddress(address: Address): string {
    const text = address.toString({ testOnly: true, bounceable: false });
    return `${text.slice(0, 6)}…${text.slice(-6)}`;
}
