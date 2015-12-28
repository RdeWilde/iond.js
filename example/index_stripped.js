#!/usr/bin/env node

/**
 * paycoind.js example
 */

process.title = 'paycoind_stripped.js';

/**
 * paycoind
 */

var paycoind = require('../index_stripped.js')({
  directory: '~/.libpaycoind-example'
});

paycoind.on('error', function(err) {
  paycoind.log('error="%s"', err.message);
});

paycoind.on('open', function(status) {
  paycoind.log('status="%s"', status);
});
