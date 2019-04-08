module.exports = function (data) {
  const sum = data.reduce((acc, value) => acc + value, 0);

  return sum / data.length;
};
