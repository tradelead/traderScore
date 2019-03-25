const sqsAsyncRecordHandler = require('./util/sqsAsyncRecordHandler');
const app = require('../app.config');

exports.NewSuccessfulWithdrawalConsumer = async function (event, context) {
  await sqsAsyncRecordHandler(event, context, async (payload, record) => {
    try {
      await app.core.useCases.ingressWithdrawal(payload);
    } catch (e) {
      console.error('Failed to ingress withdrawal', e, record);
      throw e;
    }
  });
};
