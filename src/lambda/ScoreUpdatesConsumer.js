const sqsAsyncRecordHandler = require('./util/sqsAsyncRecordHandler');
const app = require('../app.bootstrap');

exports.handler = async function (event, context) {
  await sqsAsyncRecordHandler(event, context, async (payload, record) => {
    try {
      await app.useCases.calculateTraderScore(payload);
    } catch (e) {
      console.error('Failed to calculate trader score', e, record);
      throw e;
    }
  });
};
