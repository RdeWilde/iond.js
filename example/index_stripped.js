#!/usr/bin/env node

/**
 * iond.js example
 */

process.title = 'iond_stripped.js';

/**
 * iond
 */

var iond = require('../index_stripped.js')({
  directory: '~/.libiond-example'
});

iond.on('error', function(err) {
  iond.log('error="%s"', err.message);
});

iond.on('open', function(status) {
  iond.log('status="%s"', status);
});
