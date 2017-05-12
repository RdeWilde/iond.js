/**
 * iond.js
 * Copyright (c) 2014, BitPay (MIT License)
 *
 * iondjs.h:
 *   A iond node.js binding header file.
 */
#include "nan.h"
#include "addrman.h"
#include "base58.h"
#include "init.h"
#include "noui.h"
#include <boost/thread.hpp>
#include <boost/filesystem.hpp>

NAN_METHOD(StartIond);
NAN_METHOD(IsStopping);
NAN_METHOD(IsStopped);
NAN_METHOD(StopIond);
