module.exports = class OnTradeScheduleScoreUpdates {
  constructor({ scoreUpdateScheduleRepo, traderScorePeriodConfig, events }) {
    this.scoreUpdateScheduleRepo = scoreUpdateScheduleRepo;
    this.traderScorePeriodConfig = traderScorePeriodConfig;
    this.events = events;
  }

  watch() {
    this.events.on('newTrade', (trade) => {
      this.traderScorePeriodConfig.forEach((periodConfig) => {
        this.scoreUpdateScheduleRepo.schedule({
          traderID: trade.traderID,
          period: periodConfig.id,
          time: trade.time + periodConfig.duration,
        });
      });
    });
  }
};
