'use strict';

// These tests require a fully synced Bitcore Code data directory.
// To run the tests: $ mocha -R spec index.js

var chai = require('chai');
var bitcore = require('bitcore'); // FIXME?
var iond;

/* jshint unused: false */
var should = chai.should();
var assert = chai.assert;
var sinon = require('sinon');
var txData = require('./livenet-tx-data.json');
var blockData = require('./livenet-block-data.json');
var testTxData = require('./livenet-tx-data.json');
var spentData = require('./livenet-spents.json').spent;
var unspentData = require('./livenet-spents.json').unspent;
var testBlockData = require('./testnet-block-data.json');

describe('Basic Functionality', function() {

  before(function(done) {
    this.timeout(30000);
    iond = require('../')({
      directory: process.env.IONDJS_DIR || '~/.ion',
    });

    iond.on('error', function(err) {
      iond.log('error="%s"', err.message);
    });

    iond.on('open', function(status) {
      iond.log('status="%s"', status);
    });

    console.log('Waiting for Ion Core to initialize...');

    iond.on('ready', function() {
      done();
    });

  });

  after(function(done) {
    this.timeout(20000);
    iond.stop(function(err, result) {
      done();
    });
  });

  describe('get transactions by hash', function() {
    txData.forEach(function(data) {
      var tx = bitcore.Transaction();
      tx.fromString(data);
      it('for tx ' + tx.hash, function(done) {
        iond.getTransaction(tx.hash, true, function(err, response) {
          if (err) {
            throw err;
          }
          assert(response.toString('hex') === data, 'incorrect tx data for ' + tx.hash);
          done();
        });
      });
    });
  });

  describe('determine if outpoint is unspent/spent', function() {
    spentData.forEach(function(data) {
      it('for spent txid ' + data.txid + ' and output ' + data.outputIndex, function() {
        var spent = iond.isSpent(data.txid, data.outputIndex, true);
        spent.should.equal(true);
      });
    });

    unspentData.forEach(function(data) {
      it('for unspent txid ' + data.txid + ' and output ' + data.outputIndex, function() {
        var spent = iond.isSpent(data.txid, data.outputIndex, true);
        spent.should.equal(false);
      });
    });
  });

  describe('get blocks by hash', function() {

    blockData.forEach(function(data) {
      var block = bitcore.Block.fromString(data);
      it('block ' + block.hash, function(done) {
        iond.getBlock(block.hash, function(err, response) {
          assert(response.toString('hex') === data, 'incorrect block data for ' + block.hash);
          done();
        });
      });
    });
  });

  describe('get blocks by height', function() {

    var knownHeights = [
      [0, '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'], // FIXME
      [1, '000000ed2f68cd6c7935831cc1d473da7c6decdb87e8b5dba0afff0b00002690'],
      [501,'11272cb7e1a55fa8d470db9a63645f32d14c123f78ff7ea1d4061ede70d13dfe'],
      [916, '18c3889e13b5d0b0ce54b2b82b7963f8472eb1c00dbf32f144fcef80186b7c68']
    ];

    knownHeights.forEach(function(data) {
      it('block at height ' + data[0], function(done) {
        iond.getBlock(data[0], function(err, response) {
          if (err) {
            throw err;
          }
          var block = bitcore.Block.fromBuffer(response);
          block.hash.should.equal(data[1]);
          done();
        });
      });
    });
  });

});
