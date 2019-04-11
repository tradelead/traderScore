const sqsAsyncRecordHandler = require('./util/sqsAsyncRecordHandler');
const app = require('../app.bootstrap');

exports.NewTraderExchangeConsumer = async function (event, context) {
  await sqsAsyncRecordHandler(event, context, async (payload, record) => {
    try {
      await app.useCases.ingressTraderExchange(payload);
    } catch (e) {
      console.error('Failed to ingress trader exchange', e, record);
      throw e;
    }
  });
};
