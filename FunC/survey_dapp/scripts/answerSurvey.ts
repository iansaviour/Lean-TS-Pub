import { Address } from '@ton/core';
import { SurveyDApp, toPlainPunctuation } from '../wrappers/SurveyDApp';
import { checkAnswer, Survey, SurveyAnswer } from '../wrappers/Survey';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const master = provider.open(
        SurveyDApp.createFromAddress(Address.parse(await ui.input('SurveyDApp (master) address'))),
    );
    const surveyId = Number(await ui.input('Survey id'));

    const survey = provider.open(Survey.createFromAddress(await master.getSurveyAddress(surveyId)));
    const info = await survey.getSurveyInfo();
    const questions = await survey.getQuestions();

    ui.write(`\nSurvey ${surveyId} at ${survey.address.toString()}`);
    ui.write(`Reward per completion: ${Number(info.rewardPerCompletion) / 1e9} TON, open: ${info.isOpen}`);

    if (!info.isOpen) {
        ui.write('This survey is closed');
        return;
    }

    const answers: SurveyAnswer[] = [];
    for (const [i, q] of questions.entries()) {
        ui.write(`\n${i + 1}. ${q.text}`);

        let answer: SurveyAnswer;
        let error: string | null;
        do {
            if (q.type === 'choice') {
                q.options.forEach((option, j) => ui.write(`  ${j}. ${option}`));
                const hint =
                    q.maxSelect === 1 ? 'one number' : `${q.minSelect}-${q.maxSelect} numbers, comma separated`;
                answer = (await ui.input(`Your choice (${hint})`))
                    .split(',')
                    .map((c) => c.trim())
                    .filter((c) => c.length > 0)
                    .map(Number);
            } else {
                const hint = q.asciiOnly ? ', letters/digits/punctuation only' : '';
                answer = await ui.input(`Your answer (${q.minChars}-${q.maxChars} characters${hint})`);
                // phone keyboards turn ' " ... into ’ “ … on their own
                if (q.asciiOnly) answer = toPlainPunctuation(answer);
            }
            error = checkAnswer(q, answer);
            if (error) ui.write(`  ${error}, try again`);
        } while (error);

        answers.push(answer);
    }

    await survey.sendSubmit(provider.sender(), { answers });
    ui.write('Answers sent');
}
