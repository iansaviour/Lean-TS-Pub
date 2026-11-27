import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Dictionary, toNano } from '@ton/core';
import {
    QuestionType,
    SurveyDApp,
    SurveyErrors,
    SurveyFees,
    SurveyLimits,
    SurveyOpcodes,
    SurveyQuestionDraft,
    surveyOptionsToCell,
    findNonAscii,
    toPlainPunctuation,
} from '../wrappers/SurveyDApp';
import { checkAnswer, Survey, SurveyAnswer, textAnswerToCell } from '../wrappers/Survey';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

const QUESTIONS: SurveyQuestionDraft[] = [
    {
        type: 'choice',
        question: 'Which chains do you use?',
        options: ['TON', 'Ethereum', 'Solana', 'Bitcoin', 'Other'],
        minSelect: 1,
        maxSelect: 3,
    },
    { type: 'choice', question: 'Yes or no?', options: ['Yes', 'No'], maxSelect: 1 },
    { type: 'text', question: 'What should we improve?', maxChars: 50 },
    { type: 'text', question: 'Anything else? (optional)', maxChars: 20, minChars: 0 },
];

const ANSWERS: SurveyAnswer[] = [[0, 2], [1], 'Faster wallets', ''];

describe('SurveyDApp + Survey', () => {
    let masterCode: Cell;
    let surveyCode: Cell;

    beforeAll(async () => {
        masterCode = await compile('SurveyDApp');
        surveyCode = await compile('Survey');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let creator: SandboxContract<TreasuryContract>;
    let respondent: SandboxContract<TreasuryContract>;
    let surveyDApp: SandboxContract<SurveyDApp>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        creator = await blockchain.treasury('creator');
        respondent = await blockchain.treasury('respondent');

        surveyDApp = blockchain.openContract(
            SurveyDApp.createFromConfig({ owner: deployer.address, surveyCode }, masterCode),
        );

        const deployResult = await surveyDApp.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: surveyDApp.address,
            deploy: true,
            success: true,
        });
    });

    async function createSurvey(rewardPerCompletion = toNano('0.1'), rewardPool = toNano('1'), questions = QUESTIONS) {
        const id = await surveyDApp.getSurveyCount();
        const result = await surveyDApp.sendCreateSurvey(creator.getSender(), {
            questions,
            rewardPerCompletion,
            rewardPool,
        });
        const survey = blockchain.openContract(Survey.createFromAddress(await surveyDApp.getSurveyAddress(id)));
        return { result, survey };
    }

    function balanceOf(address: Address) {
        return blockchain.getContract(address).then((c) => c.balance);
    }

    function computeGas(transactions: any[], to: Address) {
        const tx = transactions.find((t) => t.inMessage?.info.dest?.toString() === to.toString());
        if (tx.description.type !== 'generic' || tx.description.computePhase.type !== 'vm') throw new Error();
        return tx.description.computePhase.gasUsed as bigint;
    }

    it('should deploy with initial values', async () => {
        expect(await surveyDApp.getSurveyCount()).toBe(0);
        expect((await surveyDApp.getOwner()).equals(deployer.address)).toBe(true);
    });

    it('should deploy each survey as its own contract with its questions', async () => {
        const { result, survey } = await createSurvey();
        expect(result.transactions).toHaveTransaction({
            from: surveyDApp.address,
            to: survey.address,
            deploy: true,
            success: true,
        });

        const info = await survey.getSurveyInfo();
        expect(info.master.equals(surveyDApp.address)).toBe(true);
        expect(info.surveyId).toBe(0);
        expect(info.creator?.equals(creator.address)).toBe(true);
        expect(info.rewardPerCompletion).toBe(toNano('0.1'));
        expect(info.rewardPool).toBe(toNano('1'));
        expect(info.isOpen).toBe(true);
        expect(info.questionCount).toBe(4);
        expect(info.responseCount).toBe(0);

        expect(await survey.getQuestions()).toEqual([
            {
                type: 'choice',
                text: 'Which chains do you use?',
                options: ['TON', 'Ethereum', 'Solana', 'Bitcoin', 'Other'],
                minSelect: 1,
                maxSelect: 3,
                votes: [0, 0, 0, 0, 0],
            },
            { type: 'choice', text: 'Yes or no?', options: ['Yes', 'No'], minSelect: 1, maxSelect: 1, votes: [0, 0] },
            { type: 'text', text: 'What should we improve?', minChars: 1, maxChars: 50, asciiOnly: true },
            { type: 'text', text: 'Anything else? (optional)', minChars: 0, maxChars: 20, asciiOnly: true },
        ]);

        const { survey: survey2 } = await createSurvey();
        expect(survey2.address.equals(survey.address)).toBe(false);
        expect(await surveyDApp.getSurveyCount()).toBe(2);
    });

    it('should compute the same survey address off-chain', async () => {
        const offChain = Survey.createFromMaster(surveyDApp.address, 3, surveyCode);
        expect((await surveyDApp.getSurveyAddress(3)).equals(offChain.address)).toBe(true);
    });

    it('should accept multiple options and text, tally votes and store the response', async () => {
        const { survey } = await createSurvey();

        const result = await survey.sendSubmit(respondent.getSender(), { answers: ANSWERS });
        expect(result.transactions).toHaveTransaction({ to: survey.address, success: true });
        expect(result.transactions).toHaveTransaction({
            from: survey.address,
            to: respondent.address,
            value: (v?: bigint) => v !== undefined && v >= toNano('0.1'),
        });

        const questions = await survey.getQuestions();
        expect(questions[0].type === 'choice' && questions[0].votes).toEqual([1, 0, 1, 0, 0]);
        expect(questions[1].type === 'choice' && questions[1].votes).toEqual([0, 1]);

        const info = await survey.getSurveyInfo();
        expect(info.responseCount).toBe(1);
        expect(info.rewardPool).toBe(toNano('0.9'));

        const response = await survey.getResponse(0);
        expect(response.respondent.equals(respondent.address)).toBe(true);
        expect(response.answers).toEqual(ANSWERS);

        expect(await survey.getHasAnswered(respondent.address)).toBe(true);
        expect(await survey.getResponseIndex(respondent.address)).toBe(0);
        expect(await survey.getResponseIndex(creator.address)).toBe(-1);
    });

    it('should list every response in order', async () => {
        const { survey } = await createSurvey();
        const second = await blockchain.treasury('second');
        const secondAnswers: SurveyAnswer[] = [[1, 3, 4], [0], 'More docs please', 'Thanks!'];

        await survey.sendSubmit(respondent.getSender(), { answers: ANSWERS });
        await survey.sendSubmit(second.getSender(), { answers: secondAnswers });

        const responses = await survey.getResponses();
        expect(responses.map((r) => r.answers)).toEqual([ANSWERS, secondAnswers]);
        expect(await survey.getResponseIndex(second.address)).toBe(1);

        const questions = await survey.getQuestions();
        expect(questions[0].type === 'choice' && questions[0].votes).toEqual([1, 1, 1, 1, 1]);
    });

    it('should count characters, not bytes', async () => {
        const { survey } = await createSurvey(toNano('0.1'), toNano('1'), [
            { type: 'text', question: 'Five characters max', maxChars: 5, asciiOnly: false },
        ]);

        // 5 characters, 10 bytes in UTF-8
        const ok = await survey.sendSubmit(respondent.getSender(), { answers: ['ééééé'] });
        expect(ok.transactions).toHaveTransaction({ to: survey.address, success: true });
        expect((await survey.getResponse(0)).answers).toEqual(['ééééé']);

        // 5 emoji = 5 characters, 20 bytes
        const emoji = await blockchain.treasury('emoji');
        const ok2 = await survey.sendSubmit(emoji.getSender(), { answers: ['😀😀😀😀😀'] });
        expect(ok2.transactions).toHaveTransaction({ to: survey.address, success: true });

        // 6 characters
        const tooLong = await blockchain.treasury('too-long');
        const fail = await survey.sendSubmit(tooLong.getSender(), { answers: ['abcdeé'] });
        expect(fail.transactions).toHaveTransaction({
            to: survey.address,
            success: false,
            exitCode: SurveyErrors.badText,
        });
    });

    // Sent one per address, since each address can only answer once
    async function submitEach(survey: SandboxContract<Survey>, texts: string[]) {
        const results = [];
        for (const text of texts) {
            const who = await blockchain.treasury(`r-${results.length}-${text}`);
            results.push(await survey.sendSubmit(who.getSender(), { answers: [text] }));
        }
        return results;
    }

    const NOT_ASCII = [
        '😀',
        'Mantap 👍',
        'I ❤ TON',
        'café',
        'Harga €5',
        'don’t', // curly quote from a phone keyboard, not converted
        '你好',
        'baris 1\nbaris 2', // newline
        'tab\there',
        'del\x7F',
        'a'.repeat(40) + 'é', // in the second 31-byte chunk
        'a'.repeat(130) + '\x01', // in the second snake cell
    ];

    const PRINTABLE_ASCII = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('');

    const ASCII_TEXT = [
        'Terima kasih! Bagus sekali, 10/10 :)',
        PRINTABLE_ASCII, // every character from space to ~
        'x', // a 1-byte chunk
        'a'.repeat(150), // two snake cells
    ];

    it('should allow only letters, digits, space and punctuation in an asciiOnly question', async () => {
        const { survey } = await createSurvey(toNano('0.1'), toNano('1'), [
            { type: 'text', question: 'Plain text only', maxChars: 200 },
        ]);
        expect(await survey.getQuestion(0)).toMatchObject({ type: 'text', asciiOnly: true });

        for (const result of await submitEach(survey, NOT_ASCII)) {
            expect(result.transactions).toHaveTransaction({
                to: survey.address,
                success: false,
                exitCode: SurveyErrors.charNotAllowed,
            });
        }
        expect((await survey.getSurveyInfo()).responseCount).toBe(0);

        for (const result of await submitEach(survey, ASCII_TEXT)) {
            expect(result.transactions).toHaveTransaction({ to: survey.address, success: true });
        }
        expect((await survey.getResponses()).map((r) => r.answers[0])).toEqual(ASCII_TEXT);
    });

    it('should accept any text when asciiOnly is off', async () => {
        // no reward, so the pool can't run out after 10 responses
        const { survey } = await createSurvey(0n, 0n, [
            { type: 'text', question: 'Anything goes', maxChars: 200, asciiOnly: false },
        ]);
        expect(await survey.getQuestion(0)).toMatchObject({ type: 'text', asciiOnly: false });

        for (const result of await submitEach(survey, NOT_ASCII)) {
            expect(result.transactions).toHaveTransaction({ to: survey.address, success: true });
        }
    });

    it('should check characters off-chain with the same rule', () => {
        for (const text of NOT_ASCII) expect(findNonAscii(text)).not.toBeNull();
        for (const text of ASCII_TEXT) expect(findNonAscii(text)).toBeNull();

        const typed = toPlainPunctuation('don’t “stop”… – ok');
        expect(typed).toBe(`don't "stop"... - ok`);
        expect(findNonAscii(typed)).toBeNull();
    });

    it('should reject text outside min..max characters', async () => {
        const { survey } = await createSurvey();

        const tooLong = await survey.sendSubmit(respondent.getSender(), {
            answers: [[0], [0], 'x'.repeat(51), ''],
        });
        expect(tooLong.transactions).toHaveTransaction({
            to: survey.address,
            success: false,
            exitCode: SurveyErrors.badText,
        });

        // question 2 is required (minChars defaults to 1)
        const empty = await survey.sendSubmit(respondent.getSender(), { answers: [[0], [0], '', ''] });
        expect(empty.transactions).toHaveTransaction({
            to: survey.address,
            success: false,
            exitCode: SurveyErrors.badText,
        });

        // exactly at the limit is fine
        const atLimit = await survey.sendSubmit(respondent.getSender(), {
            answers: [[0], [0], 'x'.repeat(50), 'y'.repeat(20)],
        });
        expect(atLimit.transactions).toHaveTransaction({ to: survey.address, success: true });
        expect(await survey.getHasAnswered(respondent.address)).toBe(true);
    });

    it('should reject a selection outside min..max or an unknown option', async () => {
        const { survey } = await createSurvey();

        const cases: SurveyAnswer[][] = [
            [[0, 1, 2, 3], [0], 'a', ''], // 4 selected, max 3
            [[], [0], 'a', ''], // 0 selected, min 1
            [[0], [0, 1], 'a', ''], // single choice, 2 selected
            [[0], [3], 'a', ''], // option 3 does not exist on a 2-option question
        ];
        for (const answers of cases) {
            const result = await survey.sendSubmit(respondent.getSender(), { answers });
            expect(result.transactions).toHaveTransaction({
                to: survey.address,
                success: false,
                exitCode: SurveyErrors.badChoice,
            });
        }

        const questions = await survey.getQuestions();
        expect(questions[0].type === 'choice' && questions[0].votes).toEqual([0, 0, 0, 0, 0]);
        expect(await survey.getHasAnswered(respondent.address)).toBe(false);
    });

    it('should reject a submission with a missing answer', async () => {
        const { survey } = await createSurvey();
        const result = await survey.sendSubmit(respondent.getSender(), { answers: [[0], [0], 'a'] });
        expect(result.transactions).toHaveTransaction({
            to: survey.address,
            success: false,
            exitCode: SurveyErrors.missingAnswer,
        });
    });

    function rawSubmit(survey: SandboxContract<Survey>, textAnswer: Cell) {
        const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
        dict.set(0, textAnswer);
        return respondent.send({
            to: survey.address,
            value: toNano('0.1'),
            body: beginCell()
                .storeUint(SurveyOpcodes.submit, 32)
                .storeRef(beginCell().storeDictDirect(dict).endCell())
                .endCell(),
        });
    }

    it('should reject malformed text cells', async () => {
        const { survey } = await createSurvey(toNano('0.1'), toNano('1'), [
            { type: 'text', question: 'Say something', maxChars: 200 },
        ]);

        // two refs is not a snake string
        const twoRefs = beginCell()
            .storeStringTail('hi')
            .storeRef(textAnswerToCell('a'))
            .storeRef(textAnswerToCell('b'))
            .endCell();
        // a long chain of tiny cells to bloat storage
        let chain = beginCell().storeStringTail('z').endCell();
        for (let i = 0; i < 20; i++) {
            chain = beginCell().storeStringTail('z').storeRef(chain).endCell();
        }
        // half a byte
        const oddBits = beginCell().storeUint(1, 4).endCell();

        for (const bad of [twoRefs, chain, oddBits]) {
            const result = await rawSubmit(survey, bad);
            expect(result.transactions).toHaveTransaction({
                to: survey.address,
                success: false,
                exitCode: SurveyErrors.badText,
            });
        }

        // a proper multi-cell snake string is fine
        const long = 'ab'.repeat(100); // 200 chars -> 2 cells
        expect(textAnswerToCell(long).refs.length).toBe(1);
        const ok = await rawSubmit(survey, textAnswerToCell(long));
        expect(ok.transactions).toHaveTransaction({ to: survey.address, success: true });
        expect((await survey.getResponse(0)).answers).toEqual([long]);
    });

    it('should reject a second submission from the same address', async () => {
        const { survey } = await createSurvey();
        await survey.sendSubmit(respondent.getSender(), { answers: ANSWERS });

        const result = await survey.sendSubmit(respondent.getSender(), { answers: [[1], [0], 'again', ''] });
        expect(result.transactions).toHaveTransaction({
            to: survey.address,
            success: false,
            exitCode: SurveyErrors.alreadyAnswered,
        });
        expect((await survey.getSurveyInfo()).responseCount).toBe(1);
    });

    it('should reject a submission below the minimum value', async () => {
        const { survey } = await createSurvey();
        const result = await survey.sendSubmit(respondent.getSender(), {
            answers: ANSWERS,
            value: SurveyFees.minSubmit - 1n,
        });
        expect(result.transactions).toHaveTransaction({
            to: survey.address,
            success: false,
            exitCode: SurveyErrors.notEnoughTon,
        });
    });

    function rawCreate(draft: Cell) {
        const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
        dict.set(0, draft);
        return creator.send({
            to: surveyDApp.address,
            value: toNano('1'),
            body: beginCell()
                .storeUint(SurveyOpcodes.createSurvey, 32)
                .storeCoins(toNano('0.1'))
                .storeUint(1, 8)
                .storeRef(beginCell().storeDictDirect(dict).endCell())
                .endCell(),
        });
    }

    function draft(qtype: number, min: number, max: number, options?: Cell, asciiOnly = false) {
        const b = beginCell()
            .storeUint(qtype, 8)
            .storeUint(min, 16)
            .storeUint(max, 16)
            .storeBit(asciiOnly)
            .storeRef(beginCell().storeBuffer(Buffer.from('Question?')).endCell());
        if (options) b.storeRef(options);
        return b.endCell();
    }

    it('should reject invalid question drafts', async () => {
        const yesNo = surveyOptionsToCell(['Yes', 'No']);
        const cases: [Cell, number][] = [
            [draft(QuestionType.choice, 1, 3, yesNo), SurveyErrors.badOptions], // maxSelect > options
            [draft(QuestionType.choice, 2, 1, yesNo), SurveyErrors.badQuestion], // min > max
            [draft(QuestionType.choice, 0, 0, yesNo), SurveyErrors.badQuestion], // max = 0
            [draft(QuestionType.text, 1, SurveyLimits.maxTextChars + 1), SurveyErrors.badQuestion],
            [draft(QuestionType.text, 1, 10, yesNo), SurveyErrors.badQuestion], // text with options
            [draft(7, 1, 1, yesNo), SurveyErrors.badQuestion], // unknown type
            [draft(QuestionType.choice, 1, 1, yesNo, true), SurveyErrors.badQuestion], // ascii_only on a choice
        ];
        for (const [cell, exitCode] of cases) {
            const result = await rawCreate(cell);
            expect(result.transactions).toHaveTransaction({ to: surveyDApp.address, success: false, exitCode });
        }
        expect(await surveyDApp.getSurveyCount()).toBe(0);

        const ok = await rawCreate(draft(QuestionType.text, 0, SurveyLimits.maxTextChars));
        expect(ok.transactions).toHaveTransaction({ to: surveyDApp.address, success: true });
    });

    it('should keep a storage deposit from every submission', async () => {
        const { survey } = await createSurvey();
        const before = await balanceOf(survey.address);
        await survey.sendSubmit(respondent.getSender(), { answers: ANSWERS });
        const after = await balanceOf(survey.address);

        // balance only changes by the paid reward and the kept deposit
        const kept = after - before + toNano('0.1');
        expect(kept).toBeLessThanOrEqual(SurveyFees.storageDeposit);
        expect(kept).toBeGreaterThan(SurveyFees.storageDeposit - toNano('0.0001'));
    });

    it('should handle the largest possible submission with the estimated value', async () => {
        const questions = (asciiOnly: boolean): SurveyQuestionDraft[] =>
            Array.from({ length: SurveyLimits.maxQuestions }, (_, i) => ({
                type: 'text',
                question: `Question ${i}`,
                maxChars: SurveyLimits.maxTextChars,
                asciiOnly,
            }));

        // any text: every character is a 4-byte emoji, 10 x 800 bytes
        const { survey } = await createSurvey(toNano('0.1'), toNano('1'), questions(false));
        const answers = questions(false).map(() => '😀'.repeat(SurveyLimits.maxTextChars));
        const result = await survey.sendSubmit(respondent.getSender(), { answers });
        expect(result.transactions).toHaveTransaction({ to: survey.address, success: true });
        expect((await survey.getResponse(0)).answers).toEqual(answers);
        const gasAnyText = computeGas(result.transactions, survey.address);

        // asciiOnly: 1 byte per character, 10 x 200 bytes
        const { survey: ascii } = await createSurvey(toNano('0.1'), toNano('1'), questions(true));
        const plain = questions(true).map(() => 'x'.repeat(SurveyLimits.maxTextChars));
        const result2 = await ascii.sendSubmit(respondent.getSender(), { answers: plain });
        expect(result2.transactions).toHaveTransaction({ to: ascii.address, success: true });
        const gasAscii = computeGas(result2.transactions, ascii.address);

        // ~350k and ~160k today; the hard limit per transaction is 1M
        expect(gasAnyText).toBeLessThan(400_000n);
        expect(gasAscii).toBeLessThan(200_000n);
    });

    it('should keep a typical submission cheap', async () => {
        const { survey } = await createSurvey();
        const result = await survey.sendSubmit(respondent.getSender(), { answers: ANSWERS });
        // ~34k today
        expect(computeGas(result.transactions, survey.address)).toBeLessThan(50_000n);
    });

    it('should not lose TON in the master when creating the largest survey', async () => {
        const before = await balanceOf(surveyDApp.address);
        const questions: SurveyQuestionDraft[] = Array.from({ length: SurveyLimits.maxQuestions }, (_, i) => ({
            type: 'choice',
            question: `${i}`.padEnd(SurveyLimits.maxQuestionBytes, 'x'),
            options: ['a', 'b', 'c', 'd', 'e'].map((o) => o.repeat(SurveyLimits.maxOptionBytes)),
            maxSelect: 5,
        }));
        const { result } = await createSurvey(toNano('0.1'), toNano('1'), questions);
        expect(result.transactions).toHaveTransaction({ to: surveyDApp.address, success: true });
        expect(await balanceOf(surveyDApp.address)).toBeGreaterThanOrEqual(before);
    });

    it('should auto-close when the pool runs out and refund leftover to creator', async () => {
        const { survey } = await createSurvey(toNano('0.4'), toNano('1'));

        const second = await blockchain.treasury('second');
        await survey.sendSubmit(respondent.getSender(), { answers: ANSWERS });
        const result = await survey.sendSubmit(second.getSender(), { answers: ANSWERS });

        expect(result.transactions).toHaveTransaction({
            from: survey.address,
            to: creator.address,
            value: toNano('0.2'),
        });
        expect(result.transactions).toHaveTransaction({
            from: survey.address,
            to: second.address,
            value: (v?: bigint) => v !== undefined && v >= toNano('0.4'),
        });

        const info = await survey.getSurveyInfo();
        expect(info.isOpen).toBe(false);
        expect(info.rewardPool).toBe(0n);

        const late = await blockchain.treasury('late');
        const lateResult = await survey.sendSubmit(late.getSender(), { answers: ANSWERS });
        expect(lateResult.transactions).toHaveTransaction({
            to: survey.address,
            success: false,
            exitCode: SurveyErrors.closed,
        });
    });

    it('should let only the creator close a survey and keep responses readable', async () => {
        const { survey } = await createSurvey();
        await survey.sendSubmit(respondent.getSender(), { answers: ANSWERS });

        const fail = await survey.sendClose(respondent.getSender());
        expect(fail.transactions).toHaveTransaction({
            to: survey.address,
            success: false,
            exitCode: SurveyErrors.notAllowed,
        });

        const result = await survey.sendClose(creator.getSender());
        expect(result.transactions).toHaveTransaction({
            from: survey.address,
            to: creator.address,
            value: (v?: bigint) => v !== undefined && v >= toNano('0.9'),
        });
        expect((await survey.getSurveyInfo()).isOpen).toBe(false);
        expect(await balanceOf(survey.address)).toBeGreaterThan(SurveyFees.storageDeposit);
        expect((await survey.getResponse(0)).answers).toEqual(ANSWERS);
    });

    it('should reject init_survey from anyone but the master', async () => {
        const { survey } = await createSurvey();
        const result = await respondent.send({
            to: survey.address,
            value: toNano('0.05'),
            body: beginCell()
                .storeUint(SurveyOpcodes.initSurvey, 32)
                .storeAddress(respondent.address)
                .storeCoins(toNano('100'))
                .storeCoins(toNano('100'))
                .storeUint(1, 8)
                .storeRef(beginCell().endCell())
                .endCell(),
        });
        expect(result.transactions).toHaveTransaction({
            to: survey.address,
            success: false,
            exitCode: SurveyErrors.notAllowed,
        });
    });

    it('should let only the owner change owner', async () => {
        const fail = await surveyDApp.sendChangeOwner(respondent.getSender(), toNano('0.05'), respondent.address);
        expect(fail.transactions).toHaveTransaction({
            to: surveyDApp.address,
            success: false,
            exitCode: SurveyErrors.notAllowed,
        });

        await surveyDApp.sendChangeOwner(deployer.getSender(), toNano('0.05'), respondent.address);
        expect((await surveyDApp.getOwner()).equals(respondent.address)).toBe(true);
    });

    it('should validate answers off-chain the same way', () => {
        const choice = {
            type: 'choice' as const,
            text: 'q',
            options: ['a', 'b', 'c'],
            minSelect: 1,
            maxSelect: 2,
            votes: [0, 0, 0],
        };
        const text = { type: 'text' as const, text: 'q', minChars: 1, maxChars: 5, asciiOnly: false };
        const ascii = { ...text, asciiOnly: true };

        expect(checkAnswer(choice, [0, 2])).toBeNull();
        expect(checkAnswer(choice, [0, 1, 2])).not.toBeNull();
        expect(checkAnswer(choice, [])).not.toBeNull();
        expect(checkAnswer(choice, [3])).not.toBeNull();
        expect(checkAnswer(choice, [1, 1])).not.toBeNull();
        expect(checkAnswer(text, 'ééééé')).toBeNull();
        expect(checkAnswer(text, '😀😀😀😀😀😀')).not.toBeNull();
        expect(checkAnswer(text, '')).not.toBeNull();
        expect(checkAnswer(text, [0])).not.toBeNull();
        expect(checkAnswer(text, 'ok 👍')).toBeNull();
        expect(checkAnswer(ascii, 'ok 👍')).not.toBeNull();
        expect(checkAnswer(ascii, 'ok!')).toBeNull();
    });
});
