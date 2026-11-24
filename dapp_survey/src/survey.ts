// Cell layouts of the SurveyDApp / Survey contracts in Learn-TS-TON/survey_dapp.
// Everything here must match contracts/imports/survey_common.fc and wrappers/*.ts there.
// Only @ton/core is imported, so this file can also be checked outside the browser.
import { Address, beginCell, Cell, contractAddress, Dictionary, toNano } from '@ton/core';

// Master (SurveyDApp) op
const OP_CREATE_SURVEY = 0x11;
// Survey ops (sent straight to the survey's own contract)
const OP_SUBMIT = 0x12;
const OP_CLOSE_SURVEY = 0x14;

const QTYPE_CHOICE = 0;
const QTYPE_TEXT = 1;

export const LIMITS = {
    maxQuestionBytes: 100,
    maxOptionBytes: 20,
    minOptions: 2,
    maxOptions: 5,
    minQuestions: 1,
    maxQuestions: 10,
    maxTextChars: 200,
};

/** Sent on top of the reward pool when creating a survey. */
export const CREATE_FEE = toNano('0.05');
/** Minimum value of a submit; the unused part comes back with the reward. */
export const MIN_SUBMIT_VALUE = toNano('0.05');
/** Kept by the survey from every submit to pay storage for the stored answers. */
export const STORAGE_DEPOSIT = toNano('0.01');
/** What answering roughly costs: the storage deposit plus gas. A reward should be above it. */
export const ANSWER_COST = toNano('0.02');
/** Attached to the close message; the contract sends the unused part back with the pool. */
export const CLOSE_VALUE = toNano('0.05');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChoiceQuestion = {
    type: 'choice';
    text: string;
    options: string[];
    minSelect: number;
    maxSelect: number;
    /** Votes per option. One response can vote for several options. */
    votes: number[];
};

export type TextQuestion = {
    type: 'text';
    text: string;
    minChars: number;
    maxChars: number;
    /** Only letters, digits, space and normal punctuation (printable ASCII). */
    asciiOnly: boolean;
};

export type Question = ChoiceQuestion | TextQuestion;

/** Choice question: indexes of the selected options. Text question: the text. */
export type Answer = number[] | string;

export type SurveyResponse = {
    index: number;
    respondent: Address;
    answers: Answer[];
};

export type Survey = {
    id: number;
    /** Address of this survey's own Survey contract. */
    address: Address;
    creator: Address;
    rewardPerCompletion: bigint;
    rewardPool: bigint;
    isOpen: boolean;
    questions: Question[];
    responses: SurveyResponse[];
    /** respondentKey() -> response index, for every wallet that answered. */
    answered: Map<bigint, number>;
};

export type QuestionDraft =
    | { type: 'choice'; text: string; options: string[]; minSelect: number; maxSelect: number }
    | { type: 'text'; text: string; minChars: number; maxChars: number; asciiOnly: boolean };

export type MasterData = { owner: Address; surveyCount: number; surveyCode: Cell };

// ---------------------------------------------------------------------------
// Text rules (same as the contract)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

export function byteLength(text: string): number {
    return encoder.encode(text).length;
}

/** Characters as the contract counts them: Unicode code points ("é" and emoji count as 1). */
export function countChars(text: string): number {
    return [...text].length;
}

/** First character an asciiOnly question rejects (outside space .. ~), or null. */
export function findNonAscii(text: string): string | null {
    for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        if (cp < 0x20 || cp > 0x7e) return ch;
    }
    return null;
}

/** Turns what phone keyboards insert on their own (’ “ ” … – — non-breaking space) into plain ASCII. */
export function toPlainPunctuation(text: string): string {
    return text
        .replace(/[‘’‚′]/g, "'")
        .replace(/[“”„″]/g, '"')
        .replace(/…/g, '...')
        .replace(/[–—−]/g, '-')
        .replace(/ /g, ' ');
}

export type AnswerProblem =
    | { kind: 'select-exactly'; n: number }
    | { kind: 'select-range'; min: number; max: number }
    | { kind: 'text-length'; min: number; max: number; now: number }
    | { kind: 'not-ascii'; char: string };

/** Off-chain version of the contract's checks. Returns null if the answer is valid. */
export function checkAnswer(question: Question, answer: Answer): AnswerProblem | null {
    if (question.type === 'choice') {
        const selected = Array.isArray(answer) ? answer.length : 0;
        if (selected < question.minSelect || selected > question.maxSelect) {
            return question.minSelect === question.maxSelect
                ? { kind: 'select-exactly', n: question.maxSelect }
                : { kind: 'select-range', min: question.minSelect, max: question.maxSelect };
        }
        return null;
    }
    const text = typeof answer === 'string' ? answer : '';
    const chars = countChars(text);
    if (chars < question.minChars || chars > question.maxChars) {
        return { kind: 'text-length', min: question.minChars, max: question.maxChars, now: chars };
    }
    const bad = question.asciiOnly ? findNonAscii(text) : null;
    return bad ? { kind: 'not-ascii', char: bad } : null;
}

/**
 * Message value for a submit. Gas grows with the text length (~45 gas per byte),
 * so long answers send more than the minimum. The unused part comes back.
 */
export function estimateSubmitValue(answers: Answer[]): bigint {
    const textBytes = answers.reduce((n, a) => n + (typeof a === 'string' ? byteLength(a) : 0), 0);
    return MIN_SUBMIT_VALUE + BigInt(textBytes) * toNano('0.00002');
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** Pre-init data; must match pack_survey_data() in survey_common.fc */
function surveyInitData(master: Address, surveyId: number): Cell {
    return beginCell()
        .storeAddress(master)
        .storeUint(surveyId, 32)
        .storeAddress(null)
        .storeCoins(0)
        .storeCoins(0)
        .storeUint(0, 1)
        .storeUint(0, 8)
        .storeUint(0, 32)
        .storeMaybeRef(null)
        .storeMaybeRef(null)
        .storeMaybeRef(null)
        .endCell();
}

/** Same address the master computes in get_survey_address(). */
export function surveyAddress(master: Address, surveyCode: Cell, surveyId: number): Address {
    return contractAddress(0, { code: surveyCode, data: surveyInitData(master, surveyId) });
}

/** Same key as the survey's answered dict: slice_hash(respondent address). */
export function respondentKey(respondent: Address): bigint {
    const hash = beginCell().storeAddress(respondent).endCell().hash();
    return BigInt(`0x${hash.toString('hex')}`);
}

// ---------------------------------------------------------------------------
// Parsing contract data
// ---------------------------------------------------------------------------

/** owner | next_survey_id:uint32 | ^survey_code. Returns null if the data does not look like that. */
export function parseMaster(data: Cell): MasterData | null {
    const s = data.beginParse();
    if (s.remainingRefs !== 1) return null;
    return { owner: s.loadAddress(), surveyCount: s.loadUint(32), surveyCode: s.loadRef() };
}

function parseOptions(cell: Cell): string[] {
    const s = cell.beginParse();
    const count = s.loadUint(8);
    const options: string[] = [];
    for (let i = 0; i < count; i++) {
        options.push(s.loadBuffer(s.loadUint(8)).toString('utf8'));
    }
    return options;
}

/** qtype:uint8 min:uint16 max:uint16 ascii_only:uint1 ^text [^options ^votes] */
function parseQuestion(cell: Cell): Question {
    const s = cell.beginParse();
    const qtype = s.loadUint(8);
    const min = s.loadUint(16);
    const max = s.loadUint(16);
    const asciiOnly = s.loadBit();
    const text = s.loadRef().beginParse().loadStringTail();

    if (qtype === QTYPE_TEXT) {
        return { type: 'text', text, minChars: min, maxChars: max, asciiOnly };
    }

    const options = parseOptions(s.loadRef());
    const votesSlice = s.loadRef().beginParse();
    const votes: number[] = [];
    for (let i = 0; i < LIMITS.maxOptions; i++) {
        votes.push(votesSlice.loadUint(32));
    }
    return { type: 'choice', text, options, minSelect: min, maxSelect: max, votes: votes.slice(0, options.length) };
}

function parseAnswer(question: Question, cell: Cell): Answer {
    const s = cell.beginParse();
    if (question.type === 'text') {
        return s.loadStringTail();
    }
    const mask = s.loadUint(8);
    return question.options.map((_, i) => i).filter((i) => mask & (1 << i));
}

/**
 * master | survey_id:uint32 | creator | reward:coins | pool:coins | is_open:uint1
 * | question_count:uint8 | response_count:uint32 | questions | answered | responses
 *
 * Returns null while the survey is deployed but not initialised yet.
 */
export function parseSurvey(id: number, address: Address, data: Cell): Survey | null {
    const s = data.beginParse();
    s.loadAddress(); // master
    s.loadUint(32); // survey_id
    const creator = s.loadMaybeAddress();
    const rewardPerCompletion = s.loadCoins();
    const rewardPool = s.loadCoins();
    const isOpen = s.loadUint(1) === 1;
    const questionCount = s.loadUint(8);
    const responseCount = s.loadUint(32);
    const questionDict = s.loadDict(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
    const answeredDict = s.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Uint(32));
    const responseDict = s.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell());

    if (!creator || questionCount === 0) return null;

    const questions: Question[] = [];
    for (let i = 0; i < questionCount; i++) {
        const q = questionDict.get(i);
        if (!q) throw new Error(`Survey #${id} is missing question ${i}.`);
        questions.push(parseQuestion(q));
    }

    const responses: SurveyResponse[] = [];
    for (let index = 0; index < responseCount; index++) {
        const r = responseDict.get(index);
        if (!r) continue;
        const rs = r.beginParse();
        const respondent = rs.loadAddress();
        const answerDict = Dictionary.loadDirect(Dictionary.Keys.Uint(8), Dictionary.Values.Cell(), rs.loadRef());
        responses.push({
            index,
            respondent,
            answers: questions.map((q, qi) => parseAnswer(q, answerDict.get(qi)!)),
        });
    }

    return {
        id,
        address,
        creator,
        rewardPerCompletion,
        rewardPool,
        isOpen,
        questions,
        responses,
        answered: new Map(answeredDict.keys().map((key) => [key, Number(answeredDict.get(key))])),
    };
}

// ---------------------------------------------------------------------------
// Message bodies
// ---------------------------------------------------------------------------

function draftCell(draft: QuestionDraft): Cell {
    const b = beginCell().storeUint(draft.type === 'choice' ? QTYPE_CHOICE : QTYPE_TEXT, 8);
    if (draft.type === 'choice') {
        const options = beginCell().storeUint(draft.options.length, 8);
        for (const option of draft.options) {
            const bytes = Buffer.from(encoder.encode(option));
            options.storeUint(bytes.length, 8).storeBuffer(bytes);
        }
        return b
            .storeUint(draft.minSelect, 16)
            .storeUint(draft.maxSelect, 16)
            .storeBit(false)
            .storeRef(beginCell().storeBuffer(Buffer.from(encoder.encode(draft.text))).endCell())
            .storeRef(options.endCell())
            .endCell();
    }
    return b
        .storeUint(draft.minChars, 16)
        .storeUint(draft.maxChars, 16)
        .storeBit(draft.asciiOnly)
        .storeRef(beginCell().storeBuffer(Buffer.from(encoder.encode(draft.text))).endCell())
        .endCell();
}

/** Sent to the master. The master deploys a new Survey contract for it. */
export function createSurveyBody(drafts: QuestionDraft[], rewardPerCompletion: bigint): Cell {
    const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
    drafts.forEach((draft, i) => dict.set(i, draftCell(draft)));
    return beginCell()
        .storeUint(OP_CREATE_SURVEY, 32)
        .storeCoins(rewardPerCompletion)
        .storeUint(drafts.length, 8)
        .storeRef(beginCell().storeDictDirect(dict).endCell())
        .endCell();
}

/** Sent to the survey's own address. One answer per question, in order. */
export function submitBody(answers: Answer[]): Cell {
    const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
    answers.forEach((answer, i) => {
        if (typeof answer === 'string') {
            dict.set(i, beginCell().storeStringTail(answer).endCell());
        } else {
            const mask = answer.reduce((m, option) => m | (1 << option), 0);
            dict.set(i, beginCell().storeUint(mask, 8).endCell());
        }
    });
    return beginCell().storeUint(OP_SUBMIT, 32).storeRef(beginCell().storeDictDirect(dict).endCell()).endCell();
}

/** Sent to the survey's own address. Only the creator may close it. */
export function closeSurveyBody(): Cell {
    return beginCell().storeUint(OP_CLOSE_SURVEY, 32).endCell();
}
