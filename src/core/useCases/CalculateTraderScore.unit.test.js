const sinon = require('sinon');
const CalculateTraderScore = require('./CalculateTraderScore');

let req;
let unitOfWork;
let unitOfWorkFactory;
let deps;
let useCase;

beforeEach(() => {
  req = {
    traderID: 'trader123',
    period: 'day',
  };

  unitOfWork = {
    scoreService: {
      calculateScore: sinon.stub(),
    },
    complete: sinon.stub(),
    rollback: sinon.stub(),
  };

  unitOfWorkFactory = {
    create: async () => unitOfWork,
  };

  deps = { unitOfWorkFactory };

  unitOfWork.scoreService.calculateScore.resolves(123);
  useCase = new CalculateTraderScore(deps);
});

test('calls calculateScore with traderID and period', async () => {
  await useCase.execute(req);
  const { traderID, period } = req;
  sinon.assert.calledWith(unitOfWork.scoreService.calculateScore, { traderID, period });
});

test('calls unitOfWork complete', async () => {
  await useCase.execute(req);
  sinon.assert.called(unitOfWork.complete);
});

test('calls unitOfWork rollback when calculateScore rejects', async () => {
  unitOfWork.scoreService.calculateScore.rejects();
  await expect(useCase.execute(req)).rejects.toThrow();
  sinon.assert.called(unitOfWork.rollback);
});

test('calls when calculateScore period undefined', async () => {
  delete req.period;
  await useCase.execute(req);
  const { traderID, period } = req;
  sinon.assert.calledWith(unitOfWork.scoreService.calculateScore, { traderID, period });
});

test('returns calculateScore response', async () => {
  const score = await useCase.execute(req);
  expect(score).toBe(123);
});
