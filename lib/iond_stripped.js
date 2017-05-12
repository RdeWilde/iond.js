/**
 * iond.js
 * Copyright (c) 2014, BitPay (MIT License)
 * A iond node.js binding.
 */

var net = require('net');
var EventEmitter = require('events').EventEmitter;
var iondjs = require('../build/Debug/iondjs.node');
var util = require('util');
var fs = require('fs');
var mkdirp = require('mkdirp');
var tiny = require('tiny').json;

// Compatibility with old node versions:
var setImmediate = global.setImmediate || process.nextTick.bind(process);

/**
 * Ion
 */

var ion = Ion;

function Ion(options) {
  var self = this;

  if (!(this instanceof Ion)) {
    return new Ion(options);
  }

  if (Object.keys(this.instances).length) {
    throw new
      Error('iond.js cannot be instantiated more than once.');
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
    this.options.datadir = '~/.iond.js';
  }

  this.options.datadir = this.options.datadir.replace(/^~/, process.env.HOME);

  this.datadir = this.options.datadir;
  this.config = this.datadir + '/ion.conf';
  this.network = Ion[this.options.testnet ? 'testnet' : 'livenet'];

  if (!fs.existsSync(this.datadir)) {
    mkdirp.sync(this.datadir);
  }

  if (!fs.existsSync(this.config)) {
    var password = ''
      + Math.random().toString(36).slice(2)
      + Math.random().toString(36).slice(2)
      + Math.random().toString(36).slice(2);
    fs.writeFileSync(this.config, ''
      + 'rpcuser=ionrpc\n'
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
      this.datadir + '/testnet3/ion.conf',
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

Ion.prototype.__proto__ = EventEmitter.prototype;

Ion.livenet = {
  name: 'livenet',
  peers: [
    // hardcoded peers
  ]
};

Ion.testnet = {
  name: 'testnet',
  peers: [
    // hardcoded peers
  ]
};

// Make sure signal handlers are not overwritten
Ion._signalQueue = [];
Ion._processOn = process.on;
process.addListener =
process.on = function(name, listener) {
  if (~['SIGINT', 'SIGHUP', 'SIGQUIT'].indexOf(name.toUpperCase())) {
    if (!Ion.global || !Ion.global._started) {
      Ion._signalQueue.push([name, listener]);
      return;
    }
  }
  return Ion._processOn.apply(this, arguments);
};

Ion.instances = {};
Ion.prototype.instances = Ion.instances;

Ion.__defineGetter__('global', function() {
  if (ion.stopping) return [];
  return Ion.instances[Object.keys(Ion.instances)[0]];
});

Ion.prototype.__defineGetter__('global', function() {
  if (ion.stopping) return [];
  return Ion.global;
});

tiny.debug = function() {};
tiny.prototype.debug = function() {};
tiny.error = function() {};
tiny.prototype.error = function() {};

Ion.db = tiny({
  file: process.env.HOME + '/.iondjs.db',
  saveIndex: false,
  initialCache: false
});

Ion.prototype.start = function(options, callback) {
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

  iondjs.start(options, function(err, status) {
    self._started = true;


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
    process.on = process.addListener = Ion._processOn;
    Ion._signalQueue.forEach(function(event) {
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

  // iond's boost threads aren't in the thread pool
  // or on node's event loop, so we need to keep node open.
  this._shutdown = setInterval(function() {
    if (!self._stoppingSaid && iondjs.stopping()) {
      self._stoppingSaid = true;
      self.log('shutting down...');
    }

    if (iondjs.stopped()) {
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

Ion.prototype.getBlock = function(blockhash, callback) {
  if (ion.stopping) return [];
  return iondjs.getBlock(blockhash, function(err, block) {
    if (err) return callback(err);
    return callback(null, ion.block(block));
  });
};

Ion.prototype.getBlockHeight = function(height, callback) {
  if (ion.stopping) return [];
  return iondjs.getBlock(+height, function(err, block) {
    if (err) return callback(err);
    return callback(null, ion.block(block));
  });
};

Ion.prototype.getTransaction =
Ion.prototype.getTx = function(txid, blockhash, callback) {
  if (ion.stopping) return [];
  if (typeof txid === 'object' && txid) {
    var options = txid;
    callback = blockhash;
    txid = options.txid || options.tx || options.txhash || options.id || options.hash;
    blockhash = options.blockhash || options.block;
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

  return iondjs.getTransaction(txid, blockhash, function(err, tx) {
    if (err) return callback(err);
    return callback(null, ion.tx(tx));
  });
};

Ion.prototype.getTransactionWithBlock = function(txid, blockhash, callback) {
  if (ion.stopping) return [];

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

  return iondjs.getTransaction(txid, blockhash, function(err, tx) {
    if (err) return callback(err);

    if (slow && !tx.blockhash) {
      return self.getBlockByTx(txid, function(err, block, tx_) {
        if (err) return callback(err);
        return callback(null, tx, block);
      });
    }

    return iondjs.getBlock(tx.blockhash, function(err, block) {
      if (err) return callback(err);
      return callback(null, ion.tx(tx), ion.block(block));
    });
  });
};

Ion.prototype.getInfo = function() {
  if (ion.stopping) return [];
  return iondjs.getInfo();
};

Ion.prototype.getPeerInfo = function() {
  if (ion.stopping) return [];
  return iondjs.getPeerInfo();
};

Ion.prototype.getAddresses = function() {
  if (ion.stopping) return [];
  return iondjs.getAddresses();
};

Ion.prototype.getProgress = function(callback) {
  if (ion.stopping) return [];
  return iondjs.getProgress(callback);
};


Ion.prototype.getMiningInfo = function() {
  if (ion.stopping) return [];
  return iondjs.getMiningInfo();
};

Ion.prototype.getAddrTransactions = function(address, callback) {
  if (ion.stopping) return [];
  return ion.db.get('addr-tx/' + address, function(err, records) {
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
    return iondjs.getAddrTransactions(options, function(err, addr) {
      if (err) return callback(err);
      addr = ion.addr(addr);
      if (addr.tx[0] && !addr.tx[0].vout[0]) {
        return ion.db.set('addr-tx/' + address, [{
          txid: null,
          blockhash: null,
          blockheight: null,
          blocktime: null
        }], function() {
          return callback(null, ion.addr({
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
      return ion.db.set('addr-tx/' + address, set, function() {
        return callback(null, addr);
      });
    });
  });
};

Ion.prototype.getBestBlock = function(callback) {
  if (ion.stopping) return [];
  var hash = iondjs.getBestBlock();
  return iondjs.getBlock(hash, callback);
};

Ion.prototype.getChainHeight = function() {
  if (ion.stopping) return [];
  return iondjs.getChainHeight();
};

Ion.prototype.__defineGetter__('chainHeight', function() {
  if (ion.stopping) return [];
  return this.getChainHeight();
});

Ion.prototype.getBlockByTxid =
Ion.prototype.getBlockByTx = function(txid, callback) {
  if (ion.stopping) return [];
  return ion.db.get('block-tx/' + txid, function(err, block) {
    if (block) {
      return self.getBlock(block.hash, function(err, block) {
        if (err) return callback(err);
        var tx_ = block.tx.filter(function(tx) {
          return tx.txid === txid;
        })[0];
        return callback(null, block, tx_);
      });
    }
    return iondjs.getBlockByTx(txid, function(err, block, tx_) {
      if (err) return callback(err);
      ion.db.set('block-tx/' + txid, { hash: block.hash }, utils.NOOP);
      return callback(null, ion.block(block), ion.tx(tx_));
    });
  });
};

Ion.prototype.getBlocksByDate =
Ion.prototype.getBlocksByTime = function(options, callback) {
  if (ion.stopping) return [];
  return iondjs.getBlocksByTime(options, function(err, blocks) {
    if (err) return callback(err);
    return callback(null, blocks.map(function(block) {
      return ion.block(block)
    }));
  });
};

Ion.prototype.getFromTx = function(txid, callback) {
  if (ion.stopping) return [];
  return iondjs.getFromTx(txid, function(err, txs) {
    if (err) return callback(err);
    return callback(null, txs.map(function(tx) {
      return ion.tx(tx)
    }));
  });
};

Ion.prototype.getLastFileIndex = function() {
  if (ion.stopping) return [];
  return iondjs.getLastFileIndex();
};

Ion.prototype.log =
Ion.prototype.info = function() {
  if (ion.stopping) return [];
  if (this.options.silent) return;
  if (typeof arguments[0] !== 'string') {
    var out = util.inspect(arguments[0], null, 20, true);
    return process.stdout.write('iond.js: ' + out + '\n');
  }
  var out = util.format.apply(util, arguments);
  return process.stdout.write('iond.js: ' + out + '\n');
};

Ion.prototype.error = function() {
  if (ion.stopping) return [];
  if (this.options.silent) return;
  if (typeof arguments[0] !== 'string') {
    var out = util.inspect(arguments[0], null, 20, true);
    return process.stderr.write('iond.js: ' + out + '\n');
  }
  var out = util.format.apply(util, arguments);
  return process.stderr.write('iond.js: ' + out + '\n');
};

Ion.prototype.stop =
Ion.prototype.close = function(callback) {
  if (ion.stopping) return [];
  var self = this;
  return iondjs.stop(function(err, status) {
    if (err) {
      self.error(err.message);
    } else {
      self.log(status);
    }
    if (!callback) return;
    return callback(err, status);
  });
};

Ion.prototype.__defineGetter__('stopping', function() {
  return iondjs.stopping() || iondjs.stopped();
});

Ion.prototype.__defineGetter__('stopped', function() {
  return iondjs.stopped();
});

Ion.__defineGetter__('stopping', function() {
  return iondjs.stopping() || iondjs.stopped();
});

Ion.__defineGetter__('stopped', function() {
  return iondjs.stopped();
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

  if (ion.stopping) return [];

  var self = this;

  Object.keys(data).forEach(function(key) {
    if (!self[key]) {
      self[key] = data[key];
    }
  });

  this.tx = this.tx.map(function(tx) {
    return ion.tx(tx);
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
  if (ion.stopping) return [];
  return block._blockFlag === Block.prototype._blockFlag;
};

Block.fromHex = function(hex) {
  if (ion.stopping) return [];
  return ion.block(iondjs.blockFromHex(hex));
};

Block.prototype.getHash = function(enc) {
  if (ion.stopping) return [];
  var data = iondjs.getBlockHex(this);
  if (!this.hash || this.hash !== data.hash) {
    this.hash = data.hash;
  }
  if (enc === 'hex') return data.hash;
  var buf = new Buffer(data.hash, 'hex');
  var out = enc ? buf.toString(enc) : buf;
  return out;
};

Block.prototype.verify = function() {
  if (ion.stopping) return [];
  return this.verified = this.verified || iondjs.verifyBlock(this);
};

Block.prototype.toHex = function() {
  if (ion.stopping) return [];
  var hex = Block.toHex(this);
  if (!this.hex || this.hex !== hex) {
    this.hex = hex;
  }
  return hex;
};

Block.toHex = function(block) {
  if (ion.stopping) return [];
  var data = iondjs.getBlockHex(block);
  return data.hex;
};

Block.prototype.toBinary = function() {
  if (ion.stopping) return [];
  return Block.toBinary(this);
};

Block.toBinary = function(block) {
  if (ion.stopping) return [];
  var data = iondjs.getBlockHex(block);
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

  if (ion.stopping) return [];

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
  if (ion.stopping) return [];
  return tx._txFlag === Transaction.prototype._txFlag;
};

Transaction.fromHex = function(hex) {
  if (ion.stopping) return [];
  return ion.tx(iondjs.txFromHex(hex));
};

Transaction.prototype.verify = function() {
  if (ion.stopping) return [];
  return this.verified = this.verified || iondjs.verifyTransaction(this);
};

Transaction.prototype.sign =
Transaction.prototype.fill = function(options) {
  if (ion.stopping) return [];
  return Transaction.fill(this, options);
};

Transaction.sign =
Transaction.fill = function(tx, options) {
  if (ion.stopping) return [];
  var isTx = ion.tx.isTx(tx)
    , newTx;

  if (!isTx) {
    tx = ion.tx(tx);
  }

  try {
    newTx = iondjs.fillTransaction(tx, options || {});
  } catch (e) {
    return false;
  }

  Object.keys(newTx).forEach(function(key) {
    tx[key] = newTx[key];
  });

  return tx;
};

Transaction.prototype.getHash = function(enc) {
  if (ion.stopping) return [];
  var data = iondjs.getTxHex(this);
  if (!this.txid || this.txid !== data.hash) {
    this.txid = data.hash;
  }
  if (enc === 'hex') return data.hash;
  var buf = new Buffer(data.hash, 'hex');
  var out = enc ? buf.toString(enc) : buf;
  return out;
};

Transaction.prototype.isCoinbase = function() {
  if (ion.stopping) return [];
  return this.vin.length === 1 && this.vin[0].coinbase;
};

Transaction.prototype.toHex = function() {
  if (ion.stopping) return [];
  var hex = Transaction.toHex(this);
  if (!this.hex || hex !== this.hex) {
    this.hex = hex;
  }
  return hex;
};

Transaction.toHex = function(tx) {
  if (ion.stopping) return [];
  var data = iondjs.getTxHex(tx);
  return data.hex;
};

Transaction.prototype.toBinary = function() {
  if (ion.stopping) return [];
  return Transaction.toBinary(this);
};

Transaction.toBinary = function(tx) {
  if (ion.stopping) return [];
  var data = iondjs.getTxHex(tx);
  return new Buffer(data.hex, 'hex');
};

Transaction.broadcast = function(tx, options, callback) {
  if (ion.stopping) return [];
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

  if (!ion.isTx(tx)) {
    tx = ion.tx(tx);
  }

  return iondjs.broadcastTx(tx, fee, own, function(err, hash, tx) {
    if (err) {
      if (callback === utils.NOOP) {
        ion.global.emit('error', err);
      }
      return callback(err);
    }
    tx = ion.tx(tx);
    ion.global.emit('broadcast', tx);
    return callback(null, hash, tx);
  });
};

Transaction.prototype.broadcast = function(options, callback) {
  if (ion.stopping) return [];
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

  if (ion.stopping) return [];

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
  if (ion.stopping) return [];
  return addr._txFlag === Addresses.prototype._addrFlag;
};

/**
 * Utils
 */

var utils = {};

utils.forEach = function(obj, iter, done) {
  if (ion.stopping) return [];
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

module.exports = exports = ion;

exports.Ion = ion;
exports.ion = ion;
exports.iond = ion;

exports.native = iondjs;
exports.iondjs = iondjs;

exports.Block = Block;
exports.block = Block;

exports.Transaction = Transaction;
exports.transaction = Transaction;
exports.tx = Transaction;

exports.Addresses = Addresses;
exports.addresses = Addresses;
exports.addr = Addresses;

exports.utils = utils;
