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

// Must match contracts/imports/survey_common.fc

export type SurveyDAppConfig = {
    owner: Address;
    surveyCode: Cell;
};

export const SurveyOpcodes = {
    createSurvey: 0x11,
    submit: 0x12,
    changeOwner: 0x13,
    closeSurvey: 0x14,
    initSurvey: 0x15,
};

export const SurveyErrors = {
    notAllowed: 401,
    notFound: 402,
    closed: 403,
    alreadyAnswered: 404,
    badChoice: 405,
    badQuestion: 406,
    badOptions: 407,
    notEnoughTon: 408,
    badSurvey: 409,
    badText: 410,
    missingAnswer: 411,
    charNotAllowed: 412,
};

export const QuestionType = {
    choice: 0,
    text: 1,
};

export const SurveyFees = {
    /** Sent on top of the reward pool when creating a survey. */
    create: toNano('0.05'),
    /** Part of `create` kept by the master for its gas. */
    master: toNano('0.01'),
    /** Minimum value of a submit message; the unused part comes back with the reward. */
    minSubmit: toNano('0.05'),
    /** Kept by the survey from every submit to pay storage for the stored answers. */
    storageDeposit: toNano('0.01'),
};

export const SurveyLimits = {
    maxQuestionBytes: 100,
    maxOptionBytes: 20,
    minOptions: 2,
    maxOptions: 5,
    minQuestions: 1,
    maxQuestions: 10,
    /** Upper bound for a text question's maxChars. */
    maxTextChars: 200,
};

export type ChoiceQuestionDraft = {
    type: 'choice';
    question: string;
    options: string[];
    /** Fewest options the respondent must select. 0 = optional. Default 1. */
    minSelect?: number;
    /** Most options the respondent may select. 1 = single choice. Default: all options. */
    maxSelect?: number;
};

export type TextQuestionDraft = {
    type: 'text';
    question: string;
    /** Character limit of the answer, 1-200. */
    maxChars: number;
    /** Fewest characters the answer must have. 0 = optional. Default 1. */
    minChars?: number;
    /**
     * Only letters a-z A-Z, digits, space and normal punctuation (printable ASCII).
     * Emoji, accented letters, curly quotes, tabs and newlines are rejected. Default true.
     */
    asciiOnly?: boolean;
};

export type SurveyQuestionDraft = ChoiceQuestionDraft | TextQuestionDraft;

/** Characters as the contract counts them: Unicode code points ("é" and emoji count as 1). */
export function countChars(text: string): number {
    return [...text].length;
}

/**
 * First character an asciiOnly question rejects, or null if the text is fine.
 * Same rule as is_printable_ascii() in contracts/survey.fc: 0x20 (space) .. 0x7E (~).
 */
export function findNonAscii(text: string): string | null {
    for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        if (cp < 0x20 || cp > 0x7e) return ch;
    }
    return null;
}

/**
 * Replaces the punctuation phone keyboards insert automatically (curly quotes,
 * "…", long dashes, non-breaking space) with plain ASCII, so it passes an
 * asciiOnly question: don’t “stop”… → don't "stop"...
 */
export function toPlainPunctuation(text: string): string {
    return text
        .replace(/[‘’‚′]/g, "'")
        .replace(/[“”„″]/g, '"')
        .replace(/…/g, '...')
        .replace(/[–—−]/g, '-')
        .replace(/ /g, ' ');
}

export function surveyDAppConfigToCell(config: SurveyDAppConfig): Cell {
    return beginCell().storeAddress(config.owner).storeUint(0, 32).storeRef(config.surveyCode).endCell();
}

export function surveyQuestionTextToCell(text: string): Cell {
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length === 0 || bytes.length > SurveyLimits.maxQuestionBytes) {
        throw new Error(`Question must be 1-${SurveyLimits.maxQuestionBytes} bytes, got ${bytes.length}`);
    }
    return beginCell().storeBuffer(bytes).endCell();
}

export function surveyOptionsToCell(options: string[]): Cell {
    const { minOptions, maxOptions, maxOptionBytes } = SurveyLimits;
    if (options.length < minOptions || options.length > maxOptions) {
        throw new Error(`Need ${minOptions}-${maxOptions} options, got ${options.length}`);
    }
    const b = beginCell().storeUint(options.length, 8);
    for (const option of options) {
        const bytes = Buffer.from(option, 'utf8');
        if (bytes.length === 0 || bytes.length > maxOptionBytes) {
            throw new Error(`Option "${option}" must be 1-${maxOptionBytes} bytes, got ${bytes.length}`);
        }
        b.storeUint(bytes.length, 8).storeBuffer(bytes);
    }
    return b.endCell();
}

/** Draft = qtype:uint8 min_count:uint16 max_count:uint16 ascii_only:uint1 ^text [^options] */
export function surveyDraftToCell(q: SurveyQuestionDraft): Cell {
    const text = surveyQuestionTextToCell(q.question);

    if (q.type === 'choice') {
        const options = surveyOptionsToCell(q.options);
        const min = q.minSelect ?? 1;
        const max = q.maxSelect ?? q.options.length;
        if (max < 1 || max > q.options.length || min < 0 || min > max) {
            throw new Error(`"${q.question}": need 0 <= minSelect <= maxSelect <= ${q.options.length}, maxSelect >= 1`);
        }
        return beginCell()
            .storeUint(QuestionType.choice, 8)
            .storeUint(min, 16)
            .storeUint(max, 16)
            .storeBit(false)
            .storeRef(text)
            .storeRef(options)
            .endCell();
    }

    const min = q.minChars ?? 1;
    const max = q.maxChars;
    if (max < 1 || max > SurveyLimits.maxTextChars || min < 0 || min > max) {
        throw new Error(
            `"${q.question}": need 0 <= minChars <= maxChars <= ${SurveyLimits.maxTextChars}, maxChars >= 1`,
        );
    }
    return beginCell()
        .storeUint(QuestionType.text, 8)
        .storeUint(min, 16)
        .storeUint(max, 16)
        .storeBit(q.asciiOnly ?? true)
        .storeRef(text)
        .endCell();
}

/** Root cell of HashmapE 8 ^Draft, as the master expects in `^drafts`. */
export function surveyDraftsToCell(questions: SurveyQuestionDraft[]): Cell {
    const { minQuestions, maxQuestions } = SurveyLimits;
    if (questions.length < minQuestions || questions.length > maxQuestions) {
        throw new Error(`Need ${minQuestions}-${maxQuestions} questions, got ${questions.length}`);
    }
    const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
    questions.forEach((q, i) => dict.set(i, surveyDraftToCell(q)));
    return beginCell().storeDictDirect(dict).endCell();
}

export class SurveyDApp implements Contract {
    abi: ContractABI = { name: 'SurveyDApp' };

    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new SurveyDApp(address);
    }

    static createFromConfig(config: SurveyDAppConfig, code: Cell, workchain = 0) {
        const data = surveyDAppConfigToCell(config);
        const init = { code, data };
        return new SurveyDApp(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    /**
     * Deploys a new Survey contract. Sends rewardPool + SurveyFees.create;
     * each completed response pays rewardPerCompletion out of rewardPool.
     */
    async sendCreateSurvey(
        provider: ContractProvider,
        via: Sender,
        opts: { questions: SurveyQuestionDraft[]; rewardPerCompletion: bigint; rewardPool: bigint },
    ) {
        await provider.internal(via, {
            value: opts.rewardPool + SurveyFees.create,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(SurveyOpcodes.createSurvey, 32)
                .storeCoins(opts.rewardPerCompletion)
                .storeUint(opts.questions.length, 8)
                .storeRef(surveyDraftsToCell(opts.questions))
                .endCell(),
        });
    }

    async sendChangeOwner(provider: ContractProvider, via: Sender, value: bigint, newOwner: Address) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(SurveyOpcodes.changeOwner, 32).storeAddress(newOwner).endCell(),
        });
    }

    async getSurveyCount(provider: ContractProvider) {
        const result = await provider.get('get_survey_count', []);
        return result.stack.readNumber();
    }

    async getSurveyAddress(provider: ContractProvider, surveyId: number) {
        const result = await provider.get('get_survey_address', [{ type: 'int', value: BigInt(surveyId) }]);
        return result.stack.readAddress();
    }

    async getOwner(provider: ContractProvider) {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }
}
