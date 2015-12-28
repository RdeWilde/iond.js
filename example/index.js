#!/usr/bin/env node

'use strict';

/**
 * paycoind.js example
 */

process.title = 'paycoind.js';

/**
 * paycoind
 */

var paycoind = require('../')({
  directory: process.env.BITCOINDJS_DIR || '~/.paycoin'
});

paycoind.on('error', function(err) {
  paycoind.log('error="%s"', err.message);
});

paycoind.on('open', function(status) {
  paycoind.log('status="%s"', status);
});
