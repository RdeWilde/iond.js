# iond.js

A Node.js module that adds a native interface to Ion Core for querying information about the Ion blockchain. Bindings are linked to Bitcore Core compiled as a shared library.

## Example Usage

``` js
var iond = require('iond.js')({
  directory: '~/.ion',
  testnet: true
});

iond.on('ready', function() {

  iond.getBlock(blockHash, function(err, block) {
    // block is a node buffer
  }

  iond.close(function(err, result) {
    // iond is stopped
  });
});

```

You can log output from the daemon using:

``` bash
$ tail -f ~/.ion/debug.log
```

^C (SIGINT) will call `StartShutdown()` in iond on the node thread pool.

## Documentation

- `iond.start([options], [callback])` - Start the JavaScript Ion node.
- `iond.getBlock(blockHash|blockHeight, callback)` - Get any block asynchronously by block hash or height as a node buffer.
- `iond.getTransaction(txid, blockhash, callback)` - Get any tx asynchronously by reading it from disk.
- `iond.log(message), iond.info(message)` - Log to standard output.
- `iond.error(message)` - Log to stderr.
- `iond.close([callback])` - Stop the JavaScript ion node safely, the callback will be called when iond is closed. This will also be done automatically on `process.exit`. It also takes the iond node off the libuv event loop. If the iond object is the only thing on the event loop. Node will simply close.

## Building

There are two main parts of the build, compiling Ion Core and the Node.js bindings. You can run both by using `npm install` and `npm run debug_install`.

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

### Ion Core

#### Dependencies

Most of all the dependencies for building Ion Core are needed, for more information please see the build notes for [Unix](https://github.com/ion/ion/blob/master/doc/build-unix.md) and [Mac OS X](https://github.com/ion/ion/blob/master/doc/build-osx.md). These dependencies are needed:

- Boost
  - Boost Header Files (`/usr/include/boost`)
  - The Boost header files can be from your distro (like Debian or Ubuntu), just be sure to install the "-dev" versions of Boost (`sudo apt-get install libboost-all-dev`).

- OpenSSL headers and libraries (-lcrypto and -lssl), this is used to compile Ion.

- If target platform is Mac OS X, then OS X >= 10.9, Clang and associated linker.

#### Shared Library Patch

To provide native bindings to JavaScript *(or any other language for that matter)*, Ion code, itself, must be linkable. Currently, Ion Core provides a JSON RPC interface to iond as well as a shared library for script validation *(and hopefully more)* called libionconsensus. There is a node module, [node-libionconsensus](https://github.com/bitpay/node-libionconsensus), that exposes these methods. While these interfaces are useful for several use cases, there are additional use cases that are not fulfilled, and being able to implement customized interfaces is necessary. To be able to do this a few simple changes need to be made to Ion Core to compile as a shared library.

The patch is located at `etc/ion.patch` and adds a configure option `--enable-daemonlib` to compile all object files with `-fPIC` (Position Independent Code - needed to create a shared object), exposes leveldb variables and objects, exposes the threadpool to the bindings, and conditionally includes the main function.

Every effort will be made to ensure that this patch stays up-to-date with the latest release of Ion. At the very least, this project began supporting Ion Core v0.10.2.

#### Building

There is a build script that will download Ion Core v0.10.2 and apply the necessary patch, compile `libiond.{so|dylib}` and copy the artifact into `platform/<os_dir>`. Unix/Linux uses the file extension "so" whereas Mac OSX uses "dylib" *(iond compiled as a shared library)*.

```bash
$ cd /path/to/iond.js
$ ./bin/build-libiond
```

The first argument is 'debug', this will compile node bindings and iond with debug flags. The `PATCH_VERSION` file dictates what version/tag the patch goes clean against.

There is a config_options.sh that has the configure options used to build libiond. `make` will then compile `libiond/src/.libs/libiond.{so|dylib}`. This will completely ignore compiling tests, QT object files and the wallet features in `iond/libiond.{so|dylib}`.

Or you can also manually compile using:

configure and make (Linux/Unix)

```bash
$ cd libiond
$ ./configure --enable-tests=no --enable-daemonlib --with-gui=no --without-qt --without-miniupnpc --without-bdb --enable-debug --disable-wallet --without-utils
$ make
```
configure and make (Mac OS X) --note the addition of prefix to the location where the libiond library will be installed.

```bash
$ cd libiond
$ ./configure --enable-tests=no --enable-daemonlib --with-gui=no --without-qt --without-miniupnpc --without-bdb --enable-debug --disable-wallet --without-utils --prefix=<os_dir/lib>
$ make
```
And then copy the files (with Unix/Linux):

```bash
$ cp -P libiond/src/.libs/libiond.so* platform/<os_dir>
```

With Mac OS X:
```bash
$ cp -R libiond/src/.libs/libiond.*dylib platform/osx/lib
```

## License

Code released under [the MIT license](https://github.com/bitpay/iond.js/blob/master/LICENSE).

Copyright 2013-2015 BitPay, Inc.

- ion: Copyright (c) 2009-2015 Ion Core Developers (MIT License)
- bcoin (some code borrowed temporarily): Copyright Fedor Indutny, 2014.
