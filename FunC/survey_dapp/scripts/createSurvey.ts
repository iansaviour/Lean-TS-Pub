import { Address, toNano } from '@ton/core';
import { SurveyDApp, SurveyLimits, SurveyQuestionDraft } from '../wrappers/SurveyDApp';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const address = Address.parse(await ui.input('SurveyDApp (master) address'));
    const count = Number(
        await ui.input(`How many questions (${SurveyLimits.minQuestions}-${SurveyLimits.maxQuestions})`),
    );

    const questions: SurveyQuestionDraft[] = [];
    for (let i = 0; i < count; i++) {
        const question = await ui.input(`Question ${i + 1} (max ${SurveyLimits.maxQuestionBytes} bytes)`);
        const type = await ui.choose<'choice' | 'text'>('Answer type', ['choice', 'text'], (t) =>
            t === 'choice' ? 'Choice (pick one or more options)' : 'Text (free text with a character limit)',
        );

        if (type === 'choice') {
            const options = (
                await ui.input(
                    `Options, comma separated (2-${SurveyLimits.maxOptions}, max ${SurveyLimits.maxOptionBytes} bytes each)`,
                )
            )
                .split(',')
                .map((o) => o.trim())
                .filter((o) => o.length > 0);
            const maxSelect = Number(
                await ui.input(`Max options a respondent may select (1 = single choice, up to ${options.length})`),
            );
            const minSelect = Number(
                await ui.input(`Min options a respondent must select (0 = optional, up to ${maxSelect})`),
            );
            questions.push({ type, question, options, minSelect, maxSelect });
        } else {
            const maxChars = Number(await ui.input(`Max characters (1-${SurveyLimits.maxTextChars})`));
            const minChars = Number(await ui.input(`Min characters (0 = optional, up to ${maxChars})`));
            const asciiOnly = await ui.prompt(
                'Only letters, digits, spaces and punctuation (no emoji, é or other symbols)?',
            );
            questions.push({ type, question, maxChars, minChars, asciiOnly });
        }
    }

    const rewardPerCompletion = toNano(await ui.input('Reward per completed survey in TON (0 for none)'));
    const rewardPool = toNano(await ui.input('Total reward pool in TON'));

    const surveyDApp = provider.open(SurveyDApp.createFromAddress(address));
    const id = await surveyDApp.getSurveyCount();
    const surveyAddress = await surveyDApp.getSurveyAddress(id);

    await surveyDApp.sendCreateSurvey(provider.sender(), { questions, rewardPerCompletion, rewardPool });

    ui.write(`Waiting for Survey ${id} to be deployed at ${surveyAddress.toString()}...`);
    await provider.waitForDeploy(surveyAddress, 30);
    ui.clearActionPrompt();
    ui.write(`Survey ${id} deployed at ${surveyAddress.toString()}`);
}
