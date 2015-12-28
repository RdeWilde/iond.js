# paycoind.js

A Node.js module that adds a native interface to Paycoin Core for querying information about the Paycoin blockchain. Bindings are linked to Bitcore Core compiled as a shared library.

## Example Usage

``` js
var paycoind = require('paycoind.js')({
  directory: '~/.paycoin',
  testnet: true
});

paycoind.on('ready', function() {

  paycoind.getBlock(blockHash, function(err, block) {
    // block is a node buffer
  }

  paycoind.close(function(err, result) {
    // paycoind is stopped
  });
});

```

You can log output from the daemon using:

``` bash
$ tail -f ~/.paycoin/debug.log
```

^C (SIGINT) will call `StartShutdown()` in paycoind on the node thread pool.

## Documentation

- `paycoind.start([options], [callback])` - Start the JavaScript Paycoin node.
- `paycoind.getBlock(blockHash|blockHeight, callback)` - Get any block asynchronously by block hash or height as a node buffer.
- `paycoind.getTransaction(txid, blockhash, callback)` - Get any tx asynchronously by reading it from disk.
- `paycoind.log(message), paycoind.info(message)` - Log to standard output.
- `paycoind.error(message)` - Log to stderr.
- `paycoind.close([callback])` - Stop the JavaScript paycoin node safely, the callback will be called when paycoind is closed. This will also be done automatically on `process.exit`. It also takes the paycoind node off the libuv event loop. If the paycoind object is the only thing on the event loop. Node will simply close.

## Building

There are two main parts of the build, compiling Paycoin Core and the Node.js bindings. You can run both by using `npm install` and `npm run debug_install`.

### Node.js Bindings

```bash
$ node-gyp rebuild
```

And then with debug:

```bash
$ node-gyp -d rebuild
```

To be able to debug you'll need to have `gdb` and `node` compiled for debugging with gdb using `--gdb` (node_g), and you can then run:

```bash
$ gdb --args node_g path/to/example.js
```

To run integration tests against testnet or livenet data:

```bash
$ cd integration
// modify index.js configuration, and then run mocha
$ mocha -R spec index.js
```

To run the benchmarks (also with livenet or testnet data):

```bash
$ cd benchmarks
$ node index.js
```

### Paycoin Core

#### Dependencies

Most of all the dependencies for building Paycoin Core are needed, for more information please see the build notes for [Unix](https://github.com/paycoin/paycoin/blob/master/doc/build-unix.md) and [Mac OS X](https://github.com/paycoin/paycoin/blob/master/doc/build-osx.md). These dependencies are needed:

- Boost
  - Boost Header Files (`/usr/include/boost`)
  - The Boost header files can be from your distro (like Debian or Ubuntu), just be sure to install the "-dev" versions of Boost (`sudo apt-get install libboost-all-dev`).

- OpenSSL headers and libraries (-lcrypto and -lssl), this is used to compile Paycoin.

- If target platform is Mac OS X, then OS X >= 10.9, Clang and associated linker.

#### Shared Library Patch

To provide native bindings to JavaScript *(or any other language for that matter)*, Paycoin code, itself, must be linkable. Currently, Paycoin Core provides a JSON RPC interface to paycoind as well as a shared library for script validation *(and hopefully more)* called libpaycoinconsensus. There is a node module, [node-libpaycoinconsensus](https://github.com/bitpay/node-libpaycoinconsensus), that exposes these methods. While these interfaces are useful for several use cases, there are additional use cases that are not fulfilled, and being able to implement customized interfaces is necessary. To be able to do this a few simple changes need to be made to Paycoin Core to compile as a shared library.

The patch is located at `etc/paycoin.patch` and adds a configure option `--enable-daemonlib` to compile all object files with `-fPIC` (Position Independent Code - needed to create a shared object), exposes leveldb variables and objects, exposes the threadpool to the bindings, and conditionally includes the main function.

Every effort will be made to ensure that this patch stays up-to-date with the latest release of Paycoin. At the very least, this project began supporting Paycoin Core v0.10.2.

#### Building

There is a build script that will download Paycoin Core v0.10.2 and apply the necessary patch, compile `libpaycoind.{so|dylib}` and copy the artifact into `platform/<os_dir>`. Unix/Linux uses the file extension "so" whereas Mac OSX uses "dylib" *(paycoind compiled as a shared library)*.

```bash
$ cd /path/to/paycoind.js
$ ./bin/build-libpaycoind
```

The first argument is 'debug', this will compile node bindings and paycoind with debug flags. The `PATCH_VERSION` file dictates what version/tag the patch goes clean against.

There is a config_options.sh that has the configure options used to build libpaycoind. `make` will then compile `libpaycoind/src/.libs/libpaycoind.{so|dylib}`. This will completely ignore compiling tests, QT object files and the wallet features in `paycoind/libpaycoind.{so|dylib}`.

Or you can also manually compile using:

configure and make (Linux/Unix)

```bash
$ cd libpaycoind
$ ./configure --enable-tests=no --enable-daemonlib --with-gui=no --without-qt --without-miniupnpc --without-bdb --enable-debug --disable-wallet --without-utils
$ make
```
configure and make (Mac OS X) --note the addition of prefix to the location where the libpaycoind library will be installed.

```bash
$ cd libpaycoind
$ ./configure --enable-tests=no --enable-daemonlib --with-gui=no --without-qt --without-miniupnpc --without-bdb --enable-debug --disable-wallet --without-utils --prefix=<os_dir/lib>
$ make
```
And then copy the files (with Unix/Linux):

```bash
$ cp -P libpaycoind/src/.libs/libpaycoind.so* platform/<os_dir>
```

With Mac OS X:
```bash
$ cp -R libpaycoind/src/.libs/libpaycoind.*dylib platform/osx/lib
```

## License

Code released under [the MIT license](https://github.com/bitpay/paycoind.js/blob/master/LICENSE).

Copyright 2013-2015 BitPay, Inc.

- paycoin: Copyright (c) 2009-2015 Paycoin Core Developers (MIT License)
- bcoin (some code borrowed temporarily): Copyright Fedor Indutny, 2014.
