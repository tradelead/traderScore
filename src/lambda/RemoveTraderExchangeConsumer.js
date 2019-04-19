const sqsAsyncRecordHandler = require('./util/sqsAsyncRecordHandler');
const app = require('../app.bootstrap');

exports.handler = async function (event, context) {
  await sqsAsyncRecordHandler(event, context, async (payload, record) => {
    try {
      await app.useCases.removeTraderExchange(payload);
    } catch (e) {
      console.error('Failed to remove trader exchange', e, record);
      throw e;
    }
  });
};
