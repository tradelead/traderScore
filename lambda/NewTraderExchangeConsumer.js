const sqsAsyncRecordHandler = require('./util/sqsAsyncRecordHandler');
const app = require('../app.config');

exports.NewTraderExchangeConsumer = async function (event, context) {
  await sqsAsyncRecordHandler(event, context, async (payload, record) => {
    try {
      await app.core.useCases.ingressTraderExchange(payload);
    } catch (e) {
      console.error('Failed to ingress trader exchange', e, record);
      throw e;
    }
  });
};
