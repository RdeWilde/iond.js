#!/usr/bin/env node

/**
 * iond.js example
 */

process.title = 'iond.js';

/**
 * iond
 */

var iond = require('../index.js')({
  directory: '~/.ion'
});

iond.on('error', function(err) {
  iond.log('error="%s"', err.message);
});

iond.on('ready', function(err, result) {
  console.log('Ready!');

  iond.getBlock('000000000000000082ccf8f1557c5d40b21edabb18d2d691cfbf87118bac7254', function(err, block) {
    if (err) {
      console.log(err);
    }
    console.log('block', block);
  });

});

iond.on('open', function(status) {
  iond.log('status="%s"', status);
});
