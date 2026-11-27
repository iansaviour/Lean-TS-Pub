import { Address } from '@ton/core';
import { SurveyDApp } from '../wrappers/SurveyDApp';
import { Survey } from '../wrappers/Survey';
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
    const responses = await survey.getResponses();

    ui.write(`\nSurvey ${surveyId} at ${survey.address.toString()}`);
    ui.write(`Open: ${info.isOpen}, responses: ${info.responseCount}, pool left: ${Number(info.rewardPool) / 1e9} TON`);

    for (const [i, q] of questions.entries()) {
        ui.write(`\n${i + 1}. ${q.text}`);
        if (q.type === 'choice') {
            q.options.forEach((option, j) => ui.write(`  ${option}: ${q.votes[j]}`));
        } else {
            for (const r of responses) {
                const text = r.answers[i] as string;
                if (text.length > 0) ui.write(`  - "${text}"  (${r.respondent.toString()})`);
            }
        }
    }
}
