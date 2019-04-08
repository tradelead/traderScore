const averageArr = require('./averageArr');

module.exports = function (values) {
  const avg = averageArr(values);

  const squareDiffs = values.map((value) => {
    const diff = value - avg;
    return diff * diff;
  });

  const avgSquareDiff = averageArr(squareDiffs);

  return Math.sqrt(avgSquareDiff);
};
