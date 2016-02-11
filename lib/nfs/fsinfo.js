// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var fs = require('fs');
var nfs = require('nfs');
var common = require('./common');


///--- API

// Values obtained from: http://goo.gl/fBLulQ (IBM)
function fsinfo(call, reply, next) {
    var log = call.log;

    log.debug('fsinfo(%s): entered', call.object);

    fs.stat(call._filename, function (err, stats) {
        if (err) {
            log.debug(err, 'fsinfo(%s): stat failed', call._filename);
            reply.error(nfs.NFS3ERR_STALE);
            reply.send();
            next(false);
        } else {
            reply.setAttributes(stats);

            reply.wtmax = reply.rtmax = 65536;
            reply.wtpref = reply.rtpref = 32768;
            reply.wtmult = reply.rtmult = 4096;
            reply.dtpref = 8192;
            reply.maxfilesize = 1099511627776; // 1T
            reply.time_delta = {
                seconds: 0,
                nseconds: 1000000
            }; // milliseconds
            reply.properties = nfs.FSF3_LINK | nfs.FSF3_SYMLINK |
                nfs.FSF3_HOMOGENOUS | nfs.FSF3_CANSETTIME;

            log.debug('fsinfo(%s): done', call.object);
            reply.send();
            next();
        }
    });
}


///--- Exports

module.exports = function chain() {
    return ([
        common.fhandle_to_filename,
        fsinfo
    ]);
};
