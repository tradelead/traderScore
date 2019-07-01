const sinon = require('sinon');

const axiosRetry = sinon.stub();
axiosRetry.exponentialDelay = sinon.stub();
module.exports = axiosRetry;
