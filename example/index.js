#!/usr/bin/env node

'use strict';

/**
 * iond.js example
 */

process.title = 'iond.js';

/**
 * iond
 */

var iond = require('../')({
  directory: process.env.IONDJS_DIR || '~/.ion'
});

iond.on('error', function(err) {
  iond.log('error="%s"', err.message);
});

iond.on('open', function(status) {
  iond.log('status="%s"', status);
});
