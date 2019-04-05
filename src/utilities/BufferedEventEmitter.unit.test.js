const { EventEmitter } = require('events');
const BufferedEventEmitter = require('./BufferedEventEmitter');

let parentEvents;
let parentEmitter;
let bufferedEvents;
let bufferedEmitter;

beforeEach(() => {
  parentEvents = [];
  bufferedEvents = [];

  parentEmitter = new EventEmitter();
  parentEmitter.on('test', (...args) => {
    parentEvents.push({ eventName: 'test', args });
  });

  bufferedEmitter = new BufferedEventEmitter(parentEmitter);
  bufferedEmitter.on('test', (...args) => {
    bufferedEvents.push({ eventName: 'test', args });
  });
});

it('buffers events and on flush send to listeners without duplicates', () => {
  const obj = {};
  bufferedEmitter.emit('test', obj);
  expect(bufferedEvents[0].args[0]).toBe(obj);
  expect(parentEvents).toEqual([]);
  bufferedEmitter.flush();
  expect(parentEvents[0].args[0]).toBe(obj);
  expect(bufferedEvents).toHaveLength(1);
});

it('receives events after flush', () => {
  const obj = {};
  bufferedEmitter.emit('test', obj);
  bufferedEmitter.flush();

  const obj2 = {};
  bufferedEmitter.emit('test', obj2);
  expect(bufferedEvents[1].args[0]).toBe(obj2);
  expect(parentEvents[1].args[0]).toBe(obj2);
});

it('buffer receives events from parent before flush', () => {
  const obj = {};
  parentEmitter.emit('test', obj);
  expect(bufferedEvents[0].args[0]).toBe(obj);
});

it('removesListener from both', () => {
  let called = false;
  const fn = () => { called = true; };
  bufferedEmitter.on('test', fn);
  bufferedEmitter.removeListener('test', fn);

  const obj = {};
  bufferedEmitter.emit('test', obj);
  bufferedEmitter.flush();
  parentEmitter.emit('test', obj);

  expect(called).toBe(false);
});

test('once is only called once even with both emitters firing', () => {
  let called = 0;
  const fn = () => { called += 1; };
  bufferedEmitter.once('test', fn);

  bufferedEmitter.emit('test', {});
  parentEmitter.emit('test', {});

  expect(called).toBe(1);
});
