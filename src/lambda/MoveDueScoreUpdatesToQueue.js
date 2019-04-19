const app = require('../app.bootstrap');

exports.handler = async function (event, context) {
  try {
    await app.controllers.moveDueScoreUpdatesQueue();
  } catch (e) {
    console.error('Failed to move due score updates to queue', event, context);
    throw e;
  }
};
