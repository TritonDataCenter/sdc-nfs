// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var nfs = require('nfs');
var statvfs = require('statvfs');
var common = require('./common');


///--- API

// Stolen from: http://goo.gl/fBLulQ (IBM)
function fsstat(call, reply, next) {
    var log = call.log;

    log.debug('fsstat(%s): entered', call.vfspath);

    statvfs(call.vfspath, function (err, stats) {
        if (err) {
            log.warn(err, 'fs_stat: statvfs failed');
            reply.error(nfs.NFS3ERR_IO);
            next(false);
        } else {
            reply.tbytes = stats.blocks * stats.bsize;
            reply.fbytes = stats.bfree * stats.bsize;
            reply.abytes = stats.bavail * stats.bsize;
            reply.tfiles = stats.files;
            reply.ffiles = stats.ffree;
            reply.afiles = stats.favail;
            reply.invarsec = 0;

            log.debug('fsstat(%s): done', call.vfspath);
            reply.send();
            next();
        }
    });
}


///--- Exports

module.exports = function chain() {
    return ([
        fsstat
    ]);
};
