const sinon = require('sinon');
const AWS = require('aws-sdk');

jest.mock('aws-sdk');
jest.useFakeTimers();
const sqsAsyncRecordHandler = require('./sqsAsyncRecordHandler');

let event;
let context;
let fn;

let deleteMessageStub;
let changeMessageVisibilityStub;

beforeEach(() => {
  event = {
    Records: [
      {
        messageId: '059f36b4-87a3-44ab-83d2-661975830a7d',
        receiptHandle: 'AQEBwJnKyrHigUMZj6rYigCgxlaS3SLy0a...',
        body: '{ "test": 1 }',
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '1545082649183',
          SenderId: 'AIDAIENQZJOLO23YVJ4VO',
          ApproximateFirstReceiveTimestamp: '1545082649185',
        },
        messageAttributes: {},
        md5OfBody: '098f6bcd4621d373cade4e832627b4f6',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-2:123456789012:my-queue',
        awsRegion: 'us-east-2',
      },
      {
        messageId: '2e1424d4-f796-459a-8184-9c92662be6da',
        receiptHandle: 'AQEBzWwaftRI0KuVm4tP+/7q1rGgNqicHq...',
        body: '{ "test": 1 }',
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '1545082650636',
          SenderId: 'AIDAIENQZJOLO23YVJ4VO',
          ApproximateFirstReceiveTimestamp: '1545082650649',
        },
        messageAttributes: {},
        md5OfBody: '098f6bcd4621d373cade4e832627b4f6',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-2:123456789012:my-queue',
        awsRegion: 'us-east-2',
      },
    ],
  };

  fn = sinon.stub();


  AWS.SQS.mockImplementation(function () {
    this.endpoint = {
      href: 'test/',
    };

    deleteMessageStub = sinon.stub();
    deleteMessageStub.promise = sinon.stub();
    deleteMessageStub.returns(deleteMessageStub);
    this.deleteMessage = deleteMessageStub;

    changeMessageVisibilityStub = sinon.stub();
    changeMessageVisibilityStub.promise = sinon.stub();
    changeMessageVisibilityStub.returns(changeMessageVisibilityStub);
    this.changeMessageVisibility = changeMessageVisibilityStub;
  });
});

test('fn called once per record', async () => {
  await sqsAsyncRecordHandler(event, context, fn);

  sinon.assert.calledTwice(fn);
});

test('fn called with json decoded and record', async () => {
  await sqsAsyncRecordHandler(event, context, fn);

  sinon.assert.calledWith(fn, JSON.parse(event.Records[0].body), event.Records[0]);
});

test('call changeMessageVisibility after 15 seconds', async () => {
  fn.callsFake(() => new Promise(resolve => setTimeout(resolve, 15000)));

  sqsAsyncRecordHandler(event, context, fn);
  jest.advanceTimersByTime(15000);

  sinon.assert.callCount(changeMessageVisibilityStub, 2);
});

test('call changeMessageVisibility after 30 seconds', async () => {
  fn.callsFake(() => new Promise(resolve => setTimeout(resolve, 30000)));

  sqsAsyncRecordHandler(event, context, fn);
  jest.advanceTimersByTime(30000);

  sinon.assert.callCount(changeMessageVisibilityStub, 4);
});

test('call changeMessageVisibility with correct params', async () => {
  fn.callsFake(() => new Promise(resolve => setTimeout(resolve, 15000)));

  sqsAsyncRecordHandler(event, context, fn);
  jest.advanceTimersByTime(15000);

  sinon.assert.calledWith(changeMessageVisibilityStub, {
    QueueUrl: 'test/123456789012/my-queue',
    ReceiptHandle: 'AQEBwJnKyrHigUMZj6rYigCgxlaS3SLy0a...',
    VisibilityTimeout: 30,
  });
});

test('calls deleteMessage when successful', async () => {
  await sqsAsyncRecordHandler(event, context, fn);
  sinon.assert.callCount(deleteMessageStub, 2);
});

test('calls deleteMessage with correct params', async () => {
  await sqsAsyncRecordHandler(event, context, fn);

  sinon.assert.calledWith(deleteMessageStub, {
    QueueUrl: 'test/123456789012/my-queue',
    ReceiptHandle: 'AQEBwJnKyrHigUMZj6rYigCgxlaS3SLy0a...',
  });
});

test('does not call deleteMessage when fn rejects', async () => {
  fn.rejects();
  // eslint-disable-next-line
  try { await sqsAsyncRecordHandler(event, context, fn); } catch (e) {}
  sinon.assert.notCalled(deleteMessageStub);
});
