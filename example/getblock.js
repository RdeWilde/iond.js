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

  iond.getBlock('000000ed2f68cd6c7935831cc1d473da7c6decdb87e8b5dba0afff0b00002690', function(err, block) {
    if (err) {
      console.log(err);
    }
    console.log('block', block);
  });

});

iond.on('open', function(status) {
  iond.log('status="%s"', status);
});
