/* eslint-disable prefer-template */

module.exports = (ms) => {
  /**
   * You first need to create a formatting function to pad numbers to two digits…
   * */
  function twoDigits(d) {
    if (d >= 0 && d < 10) return `0${d.toString()}`;
    if (d > -10 && d < 0) return `-0${(-1 * d).toString()}`;
    return d.toString();
  }

  const date = new Date(ms);
  const milliseconds = date.getMilliseconds();

  return (
    date.getUTCFullYear()
    + '-'
    + twoDigits(1 + date.getUTCMonth())
    + '-'
    + twoDigits(date.getUTCDate())
    + ' '
    + twoDigits(date.getUTCHours())
    + ':'
    + twoDigits(date.getUTCMinutes())
    + ':' + twoDigits(date.getUTCSeconds())
    + '.'
    + (`000${milliseconds}`).substr(-3)
  );
};
