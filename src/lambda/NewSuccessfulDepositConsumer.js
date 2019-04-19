const sqsAsyncRecordHandler = require('./util/sqsAsyncRecordHandler');
const app = require('../app.bootstrap');

exports.handler = async function (event, context) {
  await sqsAsyncRecordHandler(event, context, async (payload, record) => {
    try {
      await app.useCases.ingressDeposit(payload);
    } catch (e) {
      console.error('Failed to ingress deposit', e, record);
      throw e;
    }
  });
};
