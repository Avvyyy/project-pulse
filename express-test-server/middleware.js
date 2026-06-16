const pulseLog = require('./pulseLog');
const errorLog = async (err, req, res, next) => {
  await pulseLog('error', err.message, {
    path: req.path,
    method: req.method,
    stack: err.stack
  });

  res.status(500).send('Internal Server Error');
}

module.exports = errorLog;
