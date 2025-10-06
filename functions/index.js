const { exchangeYahooCodeForToken } = require('./src/auth/yahooTokenExchange');
const { yahooFantasyProxy } = require('./src/fantasy/proxy');
const { onCall } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1' });

exports.yahooTokenExchange = onCall(exchangeYahooCodeForToken);
exports.yahooFantasyProxy = onCall(yahooFantasyProxy);