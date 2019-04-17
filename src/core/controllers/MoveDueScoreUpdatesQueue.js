module.exports = class MoveDueScoreUpdatesQueue {
  constructor({ scoreUpdateScheduleRepo, scoreUpdatesQueue }) {
    this.scoreUpdateScheduleRepo = scoreUpdateScheduleRepo;
    this.scoreUpdatesQueue = scoreUpdatesQueue;
  }

  async execute() {
    const scoreUpdates = await this.scoreUpdateScheduleRepo.fetchDue();
    const pushedCache = {};
    const promises = scoreUpdates.map(async ({ traderID, period }) => {
      const key = `${traderID}-${period}`;
      if (!pushedCache[key]) {
        pushedCache[key] = true;
        await this.scoreUpdatesQueue.push({
          traderID,
          period,
        });
      }
    });
    await Promise.all(promises);
  }
};
