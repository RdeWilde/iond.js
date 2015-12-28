{
  'targets': [{
    'target_name': 'paycoindjs',
    'include_dirs' : [
      '<!(node -e "require(\'nan\')")',
      '/usr/include/boost',
      '/usr/local/include',
      './libpaycoind/src/leveldb/include',
      './libpaycoind/src',
    ],
    'sources': [
      './src/paycoindjs.cc',
    ],
    'conditions': [
        ['OS=="mac"', {
          'xcode_settings': {
            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
            'GCC_ENABLE_CPP_RTTI': 'YES',
            'MACOSX_DEPLOYMENT_TARGET': '10.9'
          }
        }
      ]
    ],
    'cflags_cc': [
      '-fexceptions',
      '-frtti',
      '-fpermissive',
    ],
    'link_settings': {
      'libraries': [
        '-lboost_filesystem',
        '-L/usr/local/lib',
        '<!(./platform/os.sh thread)',
        '<!(./platform/os.sh lib)'
      ],
      'ldflags': [
        '-Wl,-rpath,<!(./platform/os.sh osdir),-rpath,<!(./platform/os.sh btcdir)/src/leveldb'
      ]
    }
  }]
}
