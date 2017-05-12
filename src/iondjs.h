/**
 * iond.js
 * Copyright (c) 2015, BitPay (MIT License)
 *
 * iondjs.h:
 *   A iond node.js binding header file.
 */

#include "main.h"
#include "addrman.h"
#include "alert.h"
#include "base58.h"
#include "init.h"
#include "noui.h"
#include "rpcserver.h"
#include "txdb.h"
#include <boost/thread.hpp>
#include <boost/filesystem.hpp>
#include "nan.h"
#include "scheduler.h"

NAN_METHOD(StartIond);
NAN_METHOD(OnBlocksReady);
NAN_METHOD(IsStopping);
NAN_METHOD(IsStopped);
NAN_METHOD(StopIond);
NAN_METHOD(GetBlock);
NAN_METHOD(GetTransaction);
NAN_METHOD(GetInfo);
NAN_METHOD(IsSpent);
