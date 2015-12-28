#!/usr/bin/env node

/**
 * paycoind.js example
 */

process.title = 'paycoind.js';

/**
 * paycoind
 */

var paycoind = require('../index.js')({
  directory: '~/.paycoin'
});

paycoind.on('error', function(err) {
  paycoind.log('error="%s"', err.message);
});

paycoind.on('ready', function(err, result) {
  console.log('Ready!');

  paycoind.getBlock('000000000000000082ccf8f1557c5d40b21edabb18d2d691cfbf87118bac7254', function(err, block) {
    if (err) {
      console.log(err);
    }
    console.log('block', block);
  });

});

paycoind.on('open', function(status) {
  paycoind.log('status="%s"', status);
});
