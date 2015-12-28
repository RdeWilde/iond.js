/**
 * paycoind.js
 * Copyright (c) 2014, BitPay (MIT License)
 * A paycoind node.js binding.
 */

var net = require('net');
var EventEmitter = require('events').EventEmitter;
var paycoindjs = require('bindings')('paycoindjs.node');
var util = require('util');
var fs = require('fs');
var mkdirp = require('mkdirp');
var tiny = require('tiny').json;

// Compatibility with old node versions:
var setImmediate = global.setImmediate || process.nextTick.bind(process);

/**
 * Paycoin
 */

var paycoin = Paycoin;

function Paycoin(options) {
  var self = this;

  if (!(this instanceof Paycoin)) {
    return new Paycoin(options);
  }

  if (Object.keys(this.instances).length) {
    throw new
      Error('paycoind.js cannot be instantiated more than once.');
  }

  EventEmitter.call(this);

  this.options = options || {};

  if (typeof this.options === 'string') {
    this.options = { datadir: this.options };
  }

  if (this.options.directory) {
    this.options.datadir = this.options.directory;
    delete this.options.directory;
  }

  if (!this.options.datadir) {
    this.options.datadir = '~/.paycoind.js';
  }

  this.options.datadir = this.options.datadir.replace(/^~/, process.env.HOME);

  this.datadir = this.options.datadir;
  this.config = this.datadir + '/paycoin.conf';
  this.network = Paycoin[this.options.testnet ? 'testnet' : 'livenet'];

  if (!fs.existsSync(this.datadir)) {
    mkdirp.sync(this.datadir);
  }

  if (!fs.existsSync(this.config)) {
    var password = ''
      + Math.random().toString(36).slice(2)
      + Math.random().toString(36).slice(2)
      + Math.random().toString(36).slice(2);
    fs.writeFileSync(this.config, ''
      + 'rpcuser=paycoinrpc\n'
      + 'rpcpassword=' + password + '\n'
    );
  }

  // Add hardcoded peers
  var data = fs.readFileSync(this.config, 'utf8');
  if (this.network.peers.length) {
    var peers = this.network.peers.reduce(function(out, peer) {
      if (!~data.indexOf('addnode=' + peer)) {
        return out + 'addnode=' + peer + '\n';
      }
      return out;
    }, '\n');
    fs.writeFileSync(data + peers);
  }

  // Copy config into testnet dir
  if (this.network.name === 'testnet') {
    if (!fs.existsSync(this.datadir + '/testnet3')) {
      fs.mkdirSync(this.datadir + '/testnet3');
    }
    fs.writeFileSync(
      this.datadir + '/testnet3/paycoin.conf',
      fs.readFileSync(this.config));
  }

  Object.keys(exports).forEach(function(key) {
    self[key] = exports[key];
  });

  this.on('newListener', function(name) {
    if (name === 'open') {
      self.start();
    }
  });
}

Paycoin.prototype.__proto__ = EventEmitter.prototype;

Paycoin.livenet = {
  name: 'livenet',
  peers: [
    // hardcoded peers
  ]
};

Paycoin.testnet = {
  name: 'testnet',
  peers: [
    // hardcoded peers
  ]
};

// Make sure signal handlers are not overwritten
Paycoin._signalQueue = [];
Paycoin._processOn = process.on;
process.addListener =
process.on = function(name, listener) {
  if (~['SIGINT', 'SIGHUP', 'SIGQUIT'].indexOf(name.toUpperCase())) {
    if (!Paycoin.global || !Paycoin.global._started) {
      Paycoin._signalQueue.push([name, listener]);
      return;
    }
  }
  return Paycoin._processOn.apply(this, arguments);
};

Paycoin.instances = {};
Paycoin.prototype.instances = Paycoin.instances;

Paycoin.__defineGetter__('global', function() {
  if (paycoin.stopping) return [];
  return Paycoin.instances[Object.keys(Paycoin.instances)[0]];
});

Paycoin.prototype.__defineGetter__('global', function() {
  if (paycoin.stopping) return [];
  return Paycoin.global;
});

tiny.debug = function() {};
tiny.prototype.debug = function() {};
tiny.error = function() {};
tiny.prototype.error = function() {};

Paycoin.db = tiny({
  file: process.env.HOME + '/.paycoindjs.db',
  saveIndex: false,
  initialCache: false
});

Paycoin.prototype.start = function(options, callback) {
  var self = this;

  if (!callback) {
    callback = options;
    options = null;
  }

  if (!options) {
    options = {};
  }

  if (!callback) {
    callback = utils.NOOP;
  }

  if (this.instances[this.datadir]) {
    return;
  }
  this.instances[this.datadir] = true;

  var none = {};
  var isSignal = {};
  var sigint = { name: 'SIGINT', signal: isSignal };
  var sighup = { name: 'SIGHUP', signal: isSignal };
  var sigquit = { name: 'SIGQUIT', signal: isSignal };
  var exitCaught = none;
  var errorCaught = none;

  Object.keys(this.options).forEach(function(key) {
    if (options[key] == null) {
      options[key] = self.options[key];
    }
  });

  paycoindjs.start(options, function(err, status) {
    self._started = true;

    // Poll for queued packet
    [sigint, sighup, sigquit].forEach(function(signal) {
      process.on(signal.name, signal.listener = function() {
        if (process.listeners(signal.name).length > 1) {
          return;
        }
        if (!self._shutdown) {
          process.exit(0);
        } else {
          self.stop();
          exitCaught = signal;
        }
      });
    });

    // Finally set signal handlers
    process.on = process.addListener = Paycoin._processOn;
    Paycoin._signalQueue.forEach(function(event) {
      process.on(event[0], event[1]);
    });

    var exit = process.exit;
    self._exit = function() {
      return exit.apply(process, arguments);
    };

    process.exit = function(code) {
      exitCaught = code || 0;
      if (!self._shutdown) {
        return self._exit(code);
      }
      self.stop();
    };

    process.on('uncaughtException', function(err) {
      if (process.listeners('uncaughtException').length > 1) {
        return;
      }
      errorCaught = err;
      self.error('Uncaught error: shutting down safely before throwing...');
      if (!self._shutdown) {
        if (err && err.stack) {
          console.error(err.stack);
        }
        self._exit(1);
        return;
      }
      self.stop();
    });

    paycoindjs.onBlocksReady(function(err, result) {
      self.emit('ready', result);
    });

    setTimeout(function callee() {
      // Wait until wallet is loaded:
      if (callback) {
        callback(err ? err : null);
      }

      if (err) {
        self.emit('error', err);
      } else {
        if (callback) {
          self.emit('open', status);
        } else {
          self.emit('status', status);
        }
      }

      if (callback) {
        callback = null;
      }
    }, 100);
  });

  // paycoind's boost threads aren't in the thread pool
  // or on node's event loop, so we need to keep node open.
  this._shutdown = setInterval(function() {
    if (!self._stoppingSaid && paycoindjs.stopping()) {
      self._stoppingSaid = true;
      self.log('shutting down...');
    }

    if (paycoindjs.stopped()) {
      self.log('shut down.');

      clearInterval(self._shutdown);
      delete self._shutdown;

      if (exitCaught !== none) {
        if (exitCaught.signal === isSignal) {
          process.removeListener(exitCaught.name, exitCaught.listener);
          setImmediate(function() {
            process.kill(process.pid, exitCaught.name);
          });
          return;
        }
        return self._exit(exitCaught);
      }

      if (errorCaught !== none) {
        if (errorCaught && errorCaught.stack) {
          console.error(errorCaught.stack);
        }
        return self._exit(0);
      }
    }
  }, 1000);
};

Paycoin.prototype.getBlock = function(blockhash, callback) {
  if (paycoin.stopping) return [];
  return paycoindjs.getBlock(blockhash, function(err, block) {
    if (err) return callback(err);
    return callback(null, block);
  });
};

Paycoin.prototype.getBlockHeight = function(height, callback) {
  if (paycoin.stopping) return [];
  return paycoindjs.getBlock(+height, function(err, block) {
    if (err) return callback(err);
    return callback(null, paycoin.block(block));
  });
};

Paycoin.prototype.isSpent = function(txid, outputIndex) {
  return paycoindjs.isSpent(txid, outputIndex);
};

Paycoin.prototype.getTransaction = function(txid, queryMempool, callback) {
  return paycoindjs.getTransaction(txid, queryMempool, callback);
};

Paycoin.prototype.getTransactionWithBlock = function(txid, blockhash, callback) {
  if (paycoin.stopping) return [];

  var self = this;
  var slow = true;

  if (typeof txid === 'object' && txid) {
    var options = txid;
    callback = blockhash;
    txid = options.txid || options.tx || options.txhash || options.id || options.hash;
    blockhash = options.blockhash || options.block;
    slow = options.slow !== false;
  }

  if (typeof blockhash === 'function') {
    callback = blockhash;
    blockhash = '';
  }

  if (typeof blockhash !== 'string') {
    if (blockhash) {
      blockhash = blockhash.hash
        || blockhash.blockhash
        || (blockhash.getHash && blockhash.getHash())
        || '';
    } else {
      blockhash = '';
    }
  }

  return paycoindjs.getTransaction(txid, blockhash, function(err, tx) {
    if (err) return callback(err);

    if (slow && !tx.blockhash) {
      return self.getBlockByTx(txid, function(err, block, tx_) {
        if (err) return callback(err);
        return callback(null, tx, block);
      });
    }

    return paycoindjs.getBlock(tx.blockhash, function(err, block) {
      if (err) return callback(err);
      return callback(null, paycoin.tx(tx), paycoin.block(block));
    });
  });
};

Paycoin.prototype.getInfo = function() {
  if (paycoin.stopping) return [];
  return paycoindjs.getInfo();
};

Paycoin.prototype.getPeerInfo = function() {
  if (paycoin.stopping) return [];
  return paycoindjs.getPeerInfo();
};

Paycoin.prototype.getAddresses = function() {
  if (paycoin.stopping) return [];
  return paycoindjs.getAddresses();
};

Paycoin.prototype.getProgress = function(callback) {
  if (paycoin.stopping) return [];
  return paycoindjs.getProgress(callback);
};

Paycoin.prototype.setGenerate = function(options) {
  if (paycoin.stopping) return [];
  return paycoindjs.setGenerate(options || {});
};

Paycoin.prototype.getGenerate = function(options) {
  if (paycoin.stopping) return [];
  return paycoindjs.getGenerate(options || {});
};

Paycoin.prototype.getMiningInfo = function() {
  if (paycoin.stopping) return [];
  return paycoindjs.getMiningInfo();
};

Paycoin.prototype.getAddrTransactions = function(address, callback) {
  if (paycoin.stopping) return [];
  return paycoin.db.get('addr-tx/' + address, function(err, records) {
    var options = {
      address: address,
      blockheight: (records || []).reduce(function(out, record) {
        return record.blockheight > out
          ? record.blockheight
          : out;
      }, -1),
      blocktime: (records || []).reduce(function(out, record) {
        return record.blocktime > out
          ? record.blocktime
          : out;
      }, -1)
    };
    return paycoindjs.getAddrTransactions(options, function(err, addr) {
      if (err) return callback(err);
      addr = paycoin.addr(addr);
      if (addr.tx[0] && !addr.tx[0].vout[0]) {
        return paycoin.db.set('addr-tx/' + address, [{
          txid: null,
          blockhash: null,
          blockheight: null,
          blocktime: null
        }], function() {
          return callback(null, paycoin.addr({
            address: addr.address,
            tx: []
          }));
        });
      }
      var set = [];
      if (records && records.length) {
        set = records;
      }
      addr.tx.forEach(function(tx) {
        set.push({
          txid: tx.txid,
          blockhash: tx.blockhash,
          blockheight: tx.blockheight,
          blocktime: tx.blocktime
        });
      });
      return paycoin.db.set('addr-tx/' + address, set, function() {
        return callback(null, addr);
      });
    });
  });
};

Paycoin.prototype.getBestBlock = function(callback) {
  if (paycoin.stopping) return [];
  var hash = paycoindjs.getBestBlock();
  return paycoindjs.getBlock(hash, callback);
};

Paycoin.prototype.getChainHeight = function() {
  if (paycoin.stopping) return [];
  return paycoindjs.getChainHeight();
};

Paycoin.prototype.__defineGetter__('chainHeight', function() {
  if (paycoin.stopping) return [];
  return this.getChainHeight();
});

Paycoin.prototype.getBlockByTxid =
Paycoin.prototype.getBlockByTx = function(txid, callback) {
  if (paycoin.stopping) return [];
  return paycoin.db.get('block-tx/' + txid, function(err, block) {
    if (block) {
      return self.getBlock(block.hash, function(err, block) {
        if (err) return callback(err);
        var tx_ = block.tx.filter(function(tx) {
          return tx.txid === txid;
        })[0];
        return callback(null, block, tx_);
      });
    }
    return paycoindjs.getBlockByTx(txid, function(err, block, tx_) {
      if (err) return callback(err);
      paycoin.db.set('block-tx/' + txid, { hash: block.hash }, utils.NOOP);
      return callback(null, paycoin.block(block), paycoin.tx(tx_));
    });
  });
};

Paycoin.prototype.getBlocksByDate =
Paycoin.prototype.getBlocksByTime = function(options, callback) {
  if (paycoin.stopping) return [];
  return paycoindjs.getBlocksByTime(options, function(err, blocks) {
    if (err) return callback(err);
    return callback(null, blocks.map(function(block) {
      return paycoin.block(block);
    }));
  });
};

Paycoin.prototype.getFromTx = function(txid, callback) {
  if (paycoin.stopping) return [];
  return paycoindjs.getFromTx(txid, function(err, txs) {
    if (err) return callback(err);
    return callback(null, txs.map(function(tx) {
      return paycoin.tx(tx)
    }));
  });
};

Paycoin.prototype.getLastFileIndex = function() {
  if (paycoin.stopping) return [];
  return paycoindjs.getLastFileIndex();
};

Paycoin.prototype.log =
Paycoin.prototype.info = function() {
  if (paycoin.stopping) return [];
  if (this.options.silent) return;
  if (typeof arguments[0] !== 'string') {
    var out = util.inspect(arguments[0], null, 20, true);
    return process.stdout.write('paycoind.js: ' + out + '\n');
  }
  var out = util.format.apply(util, arguments);
  return process.stdout.write('paycoind.js: ' + out + '\n');
};

Paycoin.prototype.error = function() {
  if (paycoin.stopping) return [];
  if (this.options.silent) return;
  if (typeof arguments[0] !== 'string') {
    var out = util.inspect(arguments[0], null, 20, true);
    return process.stderr.write('paycoind.js: ' + out + '\n');
  }
  var out = util.format.apply(util, arguments);
  return process.stderr.write('paycoind.js: ' + out + '\n');
};

Paycoin.prototype.stop =
Paycoin.prototype.close = function(callback) {
  if (paycoin.stopping) return [];
  var self = this;
  return paycoindjs.stop(function(err, status) {
    if (err) {
      self.error(err.message);
    } else {
      self.log(status);
    }
    if (!callback) return;
    return callback(err, status);
  });
};

Paycoin.prototype.__defineGetter__('stopping', function() {
  return paycoindjs.stopping() || paycoindjs.stopped();
});

Paycoin.prototype.__defineGetter__('stopped', function() {
  return paycoindjs.stopped();
});

Paycoin.__defineGetter__('stopping', function() {
  return paycoindjs.stopping() || paycoindjs.stopped();
});

Paycoin.__defineGetter__('stopped', function() {
  return paycoindjs.stopped();
});

/**
 * Block
 */

function Block(data) {
  if (!(this instanceof Block)) {
    return new Block(data);
  }

  if (typeof data === 'string') {
    return Block.fromHex(data);
  }

  if (data instanceof Block) {
    return data;
  }

  if (paycoin.stopping) return [];

  var self = this;

  Object.keys(data).forEach(function(key) {
    if (!self[key]) {
      self[key] = data[key];
    }
  });

  this.tx = this.tx.map(function(tx) {
    return paycoin.tx(tx);
  });

  if (!this.hex) {
    this.hex = this.toHex();
  }
}

Object.defineProperty(Block.prototype, '_blockFlag', {
  __proto__: null,
  configurable: false,
  enumerable: false,
  writable: false,
  value: {}
});

Block.isBlock = function(block) {
  if (paycoin.stopping) return [];
  return block._blockFlag === Block.prototype._blockFlag;
};

Block.fromHex = function(hex) {
  if (paycoin.stopping) return [];
  return paycoin.block(paycoindjs.blockFromHex(hex));
};

Block.prototype.getHash = function(enc) {
  if (paycoin.stopping) return [];
  var data = paycoindjs.getBlockHex(this);
  if (!this.hash || this.hash !== data.hash) {
    this.hash = data.hash;
  }
  if (enc === 'hex') return data.hash;
  var buf = new Buffer(data.hash, 'hex');
  var out = enc ? buf.toString(enc) : buf;
  return out;
};

Block.prototype.verify = function() {
  if (paycoin.stopping) return [];
  return this.verified = this.verified || paycoindjs.verifyBlock(this);
};

Block.prototype.toHex = function() {
  if (paycoin.stopping) return [];
  var hex = Block.toHex(this);
  if (!this.hex || this.hex !== hex) {
    this.hex = hex;
  }
  return hex;
};

Block.toHex = function(block) {
  if (paycoin.stopping) return [];
  var data = paycoindjs.getBlockHex(block);
  return data.hex;
};

Block.prototype.toBinary = function() {
  if (paycoin.stopping) return [];
  return Block.toBinary(this);
};

Block.toBinary = function(block) {
  if (paycoin.stopping) return [];
  var data = paycoindjs.getBlockHex(block);
  return new Buffer(data.hex, 'hex');
};

/**
 * Transaction
 */

function Transaction(data) {
  if (!(this instanceof Transaction)) {
    return new Transaction(data);
  }

  if (typeof data === 'string') {
    return Transaction.fromHex(data);
  }

  if (data instanceof Transaction) {
    return data;
  }

  if (paycoin.stopping) return [];

  var self = this;

  Object.keys(data).forEach(function(key) {
    if (!self[key]) {
      self[key] = data[key];
    }
  });

  if (!this.hex) {
    this.hex = this.toHex();
  }
}

Object.defineProperty(Transaction.prototype, '_txFlag', {
  __proto__: null,
  configurable: false,
  enumerable: false,
  writable: false,
  value: {}
});

Transaction.isTransaction =
Transaction.isTx = function(tx) {
  if (paycoin.stopping) return [];
  return tx._txFlag === Transaction.prototype._txFlag;
};

Transaction.fromHex = function(hex) {
  if (paycoin.stopping) return [];
  return paycoin.tx(paycoindjs.txFromHex(hex));
};

Transaction.prototype.verify = function() {
  if (paycoin.stopping) return [];
  return this.verified = this.verified || paycoindjs.verifyTransaction(this);
};

Transaction.prototype.sign =
Transaction.prototype.fill = function(options) {
  if (paycoin.stopping) return [];
  return Transaction.fill(this, options);
};

Transaction.sign =
Transaction.fill = function(tx, options) {
  if (paycoin.stopping) return [];
  var isTx = paycoin.tx.isTx(tx)
    , newTx;

  if (!isTx) {
    tx = paycoin.tx(tx);
  }

  try {
    newTx = paycoindjs.fillTransaction(tx, options || {});
  } catch (e) {
    return false;
  }

  Object.keys(newTx).forEach(function(key) {
    tx[key] = newTx[key];
  });

  return tx;
};

Transaction.prototype.getHash = function(enc) {
  if (paycoin.stopping) return [];
  var data = paycoindjs.getTxHex(this);
  if (!this.txid || this.txid !== data.hash) {
    this.txid = data.hash;
  }
  if (enc === 'hex') return data.hash;
  var buf = new Buffer(data.hash, 'hex');
  var out = enc ? buf.toString(enc) : buf;
  return out;
};

Transaction.prototype.isCoinbase = function() {
  if (paycoin.stopping) return [];
  return this.vin.length === 1 && this.vin[0].coinbase;
};

Transaction.prototype.toHex = function() {
  if (paycoin.stopping) return [];
  var hex = Transaction.toHex(this);
  if (!this.hex || hex !== this.hex) {
    this.hex = hex;
  }
  return hex;
};

Transaction.toHex = function(tx) {
  if (paycoin.stopping) return [];
  var data = paycoindjs.getTxHex(tx);
  return data.hex;
};

Transaction.prototype.toBinary = function() {
  if (paycoin.stopping) return [];
  return Transaction.toBinary(this);
};

Transaction.toBinary = function(tx) {
  if (paycoin.stopping) return [];
  var data = paycoindjs.getTxHex(tx);
  return new Buffer(data.hex, 'hex');
};

Transaction.broadcast = function(tx, options, callback) {
  if (paycoin.stopping) return [];
  if (typeof tx === 'string') {
    tx = { hex: tx };
  }

  if (!callback) {
    callback = options;
    options = null;
  }

  if (!options) {
    options = {};
  }

  var fee = options.overrideFees = options.overrideFees || false;
  var own = options.ownOnly = options.ownOnly || false;

  if (!callback) {
    callback = utils.NOOP;
  }

  if (!paycoin.isTx(tx)) {
    tx = paycoin.tx(tx);
  }

  return paycoindjs.broadcastTx(tx, fee, own, function(err, hash, tx) {
    if (err) {
      if (callback === utils.NOOP) {
        paycoin.global.emit('error', err);
      }
      return callback(err);
    }
    tx = paycoin.tx(tx);
    paycoin.global.emit('broadcast', tx);
    return callback(null, hash, tx);
  });
};

Transaction.prototype.broadcast = function(options, callback) {
  if (paycoin.stopping) return [];
  if (!callback) {
    callback = options;
    options = null;
  }
  return Transaction.broadcast(this, options, callback);
};

/**
 * Addresses
 */

function Addresses(data) {
  if (!(this instanceof Addresses)) {
    return new Addresses(data);
  }

  if (data instanceof Addresses) {
    return data;
  }

  if (paycoin.stopping) return [];

  var self = this;

  Object.keys(data).forEach(function(key) {
    if (!self[key]) {
      self[key] = data[key];
    }
  });
}

Object.defineProperty(Transaction.prototype, '_addrFlag', {
  __proto__: null,
  configurable: false,
  enumerable: false,
  writable: false,
  value: {}
});

Addresses.isAddresses =
Addresses.isAddr = function(addr) {
  if (paycoin.stopping) return [];
  return addr._txFlag === Addresses.prototype._addrFlag;
};

/**
 * Utils
 */

var utils = {};

utils.forEach = function(obj, iter, done) {
  if (paycoin.stopping) return [];
  var pending = obj.length;
  if (!pending) return done();
  var next = function() {
    if (!--pending) done();
  };
  obj.forEach(function(item) {
    iter(item, next);
  });
};

utils.NOOP = function() {};

/**
 * Expose
 */

module.exports = exports = paycoin;

exports.Paycoin = paycoin;
exports.paycoin = paycoin;
exports.paycoind = paycoin;

exports.native = paycoindjs;
exports.paycoindjs = paycoindjs;

exports.Block = Block;
exports.block = Block;

exports.Transaction = Transaction;
exports.transaction = Transaction;
exports.tx = Transaction;

exports.Addresses = Addresses;
exports.addresses = Addresses;
exports.addr = Addresses;

exports.utils = utils;
