const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
const { IamAuthenticator } = require('ibm-watson/auth');

module.exports = {
  synthesize: (voice) =>
    new Promise((resolve, reject) => {
      const speechToText = new SpeechToTextV1({
        authenticator: new IamAuthenticator({
          apikey: process.env.SPEECH_TO_TEXT_API_KEY,
        }),
        serviceUrl: 'https://api.us-south.speech-to-text.watson.cloud.ibm.com',
      });

      speechToText
        .recognize({
          audio: voice,
          contentType: 'application/octet-stream',
          model: 'pt-BR_BroadbandModel',
        })
        .then((response) => {
          return response.result.results[0]?.alternatives[0]?.transcript ?? '';
        })
        .then(resolve)
        .catch(reject);
    }),
};
