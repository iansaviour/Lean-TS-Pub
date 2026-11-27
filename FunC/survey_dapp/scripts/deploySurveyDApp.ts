import { toNano } from '@ton/core';
import { SurveyDApp } from '../wrappers/SurveyDApp';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const owner = provider.sender().address;
    if (!owner) {
        throw new Error('Sender address is required to set the contract owner');
    }

    const surveyCode = await compile('Survey');
    const surveyDApp = provider.open(SurveyDApp.createFromConfig({ owner, surveyCode }, await compile('SurveyDApp')));

    await surveyDApp.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(surveyDApp.address);

    console.log('Owner:', (await surveyDApp.getOwner()).toString());
    console.log('Surveys:', await surveyDApp.getSurveyCount());
}
