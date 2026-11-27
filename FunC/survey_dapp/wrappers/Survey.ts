import {
    Address,
    beginCell,
    Cell,
    Contract,
    ContractABI,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';
import { countChars, findNonAscii, QuestionType, SurveyFees, SurveyLimits, SurveyOpcodes } from './SurveyDApp';

export type SurveyInfo = {
    master: Address;
    surveyId: number;
    creator: Address | null;
    rewardPerCompletion: bigint;
    rewardPool: bigint;
    isOpen: boolean;
    questionCount: number;
    responseCount: number;
};

export type ChoiceQuestion = {
    type: 'choice';
    text: string;
    options: string[];
    minSelect: number;
    maxSelect: number;
    /** Votes per option; one response can vote for several options. */
    votes: number[];
};

export type TextQuestion = {
    type: 'text';
    text: string;
    minChars: number;
    maxChars: number;
    /** Only letters, digits, space and normal punctuation (see findNonAscii). */
    asciiOnly: boolean;
};

export type SurveyQuestion = ChoiceQuestion | TextQuestion;

/** Choice question: indexes of the selected options. Text question: the text. */
export type SurveyAnswer = number[] | string;

export type SurveyResponse = {
    respondent: Address;
    answers: SurveyAnswer[];
};

/** Initial (pre-init) data; must match pack_survey_data() in contracts/imports/survey_common.fc */
export function surveyInitData(master: Address, surveyId: number): Cell {
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

/** Choice answer cell: mask:uint8, bit i set = option i selected. */
export function choiceAnswerToCell(selected: number[]): Cell {
    let mask = 0;
    for (const i of selected) {
        if (!Number.isInteger(i) || i < 0 || i >= SurveyLimits.maxOptions) {
            throw new Error(`Invalid option index ${i}`);
        }
        if (mask & (1 << i)) {
            throw new Error(`Option ${i} selected twice`);
        }
        mask |= 1 << i;
    }
    return beginCell().storeUint(mask, 8).endCell();
}

/** Text answer cell: UTF-8 snake string. */
export function textAnswerToCell(text: string): Cell {
    return beginCell().storeStringTail(text).endCell();
}

/** Root cell of HashmapE 8 ^Answer, as the survey expects in `^answers`. */
export function surveyAnswersToCell(answers: SurveyAnswer[]): Cell {
    const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
    answers.forEach((a, i) => dict.set(i, typeof a === 'string' ? textAnswerToCell(a) : choiceAnswerToCell(a)));
    return beginCell().storeDictDirect(dict).endCell();
}

/**
 * Off-chain version of the contract's checks, so a UI can show the problem
 * before sending. Returns an error message, or null if the answer is valid.
 */
export function checkAnswer(question: SurveyQuestion, answer: SurveyAnswer | undefined): string | null {
    if (question.type === 'choice') {
        if (!Array.isArray(answer)) return 'Expected a list of option numbers';
        if (new Set(answer).size !== answer.length) return 'Each option can only be selected once';
        if (answer.some((i) => !Number.isInteger(i) || i < 0 || i >= question.options.length)) {
            return `Options must be between 0 and ${question.options.length - 1}`;
        }
        if (answer.length < question.minSelect || answer.length > question.maxSelect) {
            return question.minSelect === question.maxSelect
                ? `Select exactly ${question.maxSelect} option(s)`
                : `Select ${question.minSelect}-${question.maxSelect} options`;
        }
        return null;
    }

    if (typeof answer !== 'string') return 'Expected text';
    const chars = countChars(answer);
    if (chars < question.minChars || chars > question.maxChars) {
        return `Text must be ${question.minChars}-${question.maxChars} characters, got ${chars}`;
    }
    const bad = question.asciiOnly ? findNonAscii(answer) : null;
    if (bad) {
        return `Only letters, digits, spaces and normal punctuation are allowed (found ${JSON.stringify(bad)})`;
    }
    return null;
}

/**
 * Message value for a submit. Gas grows with the text length (~45 gas per byte,
 * since every byte is checked on-chain), so long answers send more than the minimum.
 * Whatever is not used comes back together with the reward.
 */
export function estimateSubmitValue(answers: SurveyAnswer[]): bigint {
    const textBytes = answers.reduce((n, a) => n + (typeof a === 'string' ? Buffer.byteLength(a, 'utf8') : 0), 0);
    return SurveyFees.minSubmit + BigInt(textBytes) * toNano('0.00002');
}

function parseOptions(cell: Cell): string[] {
    const s = cell.beginParse();
    const count = s.loadUint(8);
    const options: string[] = [];
    for (let i = 0; i < count; i++) {
        const len = s.loadUint(8);
        options.push(s.loadBuffer(len).toString('utf8'));
    }
    return options;
}

function parseAnswer(question: SurveyQuestion, cell: Cell): SurveyAnswer {
    if (question.type === 'text') {
        return cell.beginParse().loadStringTail();
    }
    const mask = cell.beginParse().loadUint(8);
    return question.options.map((_, i) => i).filter((i) => mask & (1 << i));
}

export class Survey implements Contract {
    abi: ContractABI = { name: 'Survey' };

    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Survey(address);
    }

    /** Computes the survey address off-chain, same as the master's get_survey_address(). */
    static createFromMaster(master: Address, surveyId: number, code: Cell, workchain = 0) {
        const init = { code, data: surveyInitData(master, surveyId) };
        return new Survey(contractAddress(workchain, init), init);
    }

    /** One answer per question, in order. */
    async sendSubmit(provider: ContractProvider, via: Sender, opts: { answers: SurveyAnswer[]; value?: bigint }) {
        await provider.internal(via, {
            value: opts.value ?? estimateSubmitValue(opts.answers),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(SurveyOpcodes.submit, 32).storeRef(surveyAnswersToCell(opts.answers)).endCell(),
        });
    }

    async sendClose(provider: ContractProvider, via: Sender, value = toNano('0.02')) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(SurveyOpcodes.closeSurvey, 32).endCell(),
        });
    }

    async getSurveyInfo(provider: ContractProvider): Promise<SurveyInfo> {
        const result = await provider.get('get_survey_info', []);
        return {
            master: result.stack.readAddress(),
            surveyId: result.stack.readNumber(),
            creator: result.stack.readAddressOpt(),
            rewardPerCompletion: result.stack.readBigNumber(),
            rewardPool: result.stack.readBigNumber(),
            isOpen: result.stack.readNumber() === 1,
            questionCount: result.stack.readNumber(),
            responseCount: result.stack.readNumber(),
        };
    }

    async getQuestion(provider: ContractProvider, index: number): Promise<SurveyQuestion> {
        const result = await provider.get('get_question', [{ type: 'int', value: BigInt(index) }]);
        const qtype = result.stack.readNumber();
        const min = result.stack.readNumber();
        const max = result.stack.readNumber();
        const asciiOnly = result.stack.readNumber() !== 0;
        const text = result.stack.readCell().beginParse().loadStringTail();
        const options = result.stack.readCellOpt();
        const votes = result.stack.readCellOpt();

        if (qtype === QuestionType.text) {
            return { type: 'text', text, minChars: min, maxChars: max, asciiOnly };
        }

        const optionList = parseOptions(options!);
        const votesSlice = votes!.beginParse();
        const voteList: number[] = [];
        for (let i = 0; i < SurveyLimits.maxOptions; i++) {
            voteList.push(votesSlice.loadUint(32));
        }
        return {
            type: 'choice',
            text,
            options: optionList,
            minSelect: min,
            maxSelect: max,
            votes: voteList.slice(0, optionList.length),
        };
    }

    async getQuestions(provider: ContractProvider): Promise<SurveyQuestion[]> {
        const { questionCount } = await this.getSurveyInfo(provider);
        const questions: SurveyQuestion[] = [];
        for (let i = 0; i < questionCount; i++) {
            questions.push(await this.getQuestion(provider, i));
        }
        return questions;
    }

    /** Pass `questions` when reading many responses, to avoid re-fetching them each time. */
    async getResponse(
        provider: ContractProvider,
        index: number,
        questions?: SurveyQuestion[],
    ): Promise<SurveyResponse> {
        const qs = questions ?? (await this.getQuestions(provider));
        const result = await provider.get('get_response', [{ type: 'int', value: BigInt(index) }]);
        const respondent = result.stack.readAddress();
        const dict = Dictionary.loadDirect(Dictionary.Keys.Uint(8), Dictionary.Values.Cell(), result.stack.readCell());
        return {
            respondent,
            answers: qs.map((q, i) => parseAnswer(q, dict.get(i)!)),
        };
    }

    async getResponses(provider: ContractProvider): Promise<SurveyResponse[]> {
        const { responseCount } = await this.getSurveyInfo(provider);
        const questions = await this.getQuestions(provider);
        const responses: SurveyResponse[] = [];
        for (let i = 0; i < responseCount; i++) {
            responses.push(await this.getResponse(provider, i, questions));
        }
        return responses;
    }

    /** Index of this respondent's response, or -1 if they have not answered. */
    async getResponseIndex(provider: ContractProvider, respondent: Address) {
        const result = await provider.get('get_response_index', [
            { type: 'slice', cell: beginCell().storeAddress(respondent).endCell() },
        ]);
        return result.stack.readNumber();
    }

    async getHasAnswered(provider: ContractProvider, respondent: Address) {
        const result = await provider.get('has_answered', [
            { type: 'slice', cell: beginCell().storeAddress(respondent).endCell() },
        ]);
        return result.stack.readNumber() !== 0;
    }
}
