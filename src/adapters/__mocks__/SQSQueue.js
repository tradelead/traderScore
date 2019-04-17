const mock = {
  push: jest.fn(),
};

module.exports = jest.fn().mockImplementation(() => mock);
