const { EventEmitter } = require('events');

module.exports = class BufferEventEmitter extends EventEmitter {
  constructor(eventEmitter) {
    super();
    this.eventEmitter = eventEmitter;
    this.eventBuffer = [];
    this.flushed = false;
    this.listeners = [];
    this.running = [];
  }

  emit(eventName, ...args) {
    if (this.flushed) {
      this.eventEmitter.emit(eventName, ...args);
    } else {
      super.emit(eventName, ...args);
      this.eventBuffer.push({ type: eventName, args });
    }

    return true;
  }

  on(eventName, listener) {
    this.listeners.push({ eventName, listener });
    super.on(eventName, listener);
    this.eventEmitter.on(eventName, listener);

    return this;
  }

  once(eventName, listener) {
    let running = false;

    this.listeners.push({ eventName, listener });
    super.once(eventName, (...args) => {
      if (running === false) {
        running = true;
        this.removeListener(eventName, listener);
        listener(...args);
      }
    });

    this.eventEmitter.once(eventName, (...args) => {
      if (running === false) {
        running = true;
        this.removeListener(eventName, listener);
        listener(...args);
      }
    });

    return this;
  }

  removeListener(eventName, listener) {
    // eslint-disable-next-line
    for (let i = 0; i < this.listeners.length; i++) {
      const item = this.listeners[i];
      if (item.eventName === eventName && item.listener === listener) {
        this.listeners.splice(i, 1);
        break;
      }
    }

    super.removeListener(eventName, listener);
    this.eventEmitter.removeListener(eventName, listener);
    return this;
  }

  flush() {
    this.listeners.forEach((item) => {
      this.eventEmitter.removeListener(item.eventName, item.listener);
    });

    this.eventBuffer.forEach((event) => {
      this.eventEmitter.emit(event.type, ...event.args);
    });

    this.listeners.forEach((item) => {
      this.eventEmitter.on(item.eventName, item.listener);
    });

    this.flushed = true;
    this.eventBuffer = [];

    return this;
  }
};
