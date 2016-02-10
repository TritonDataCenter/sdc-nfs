// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var assert = require('assert-plus');
var fs = require('fs');
var nfs = require('nfs');
var common = require('./common');

///-- API

function read(call, reply, next) {
    var data = new Buffer(call.count);
    var log = call.log;
    var stats = call.stats;

    log.debug('read(%s, %d, %d): entered',
              call.object, call.offset, call.count);

    assert.ok(stats);

    fs.read(stats.fd, data, 0, call.count, call.offset, function (err, n) {
        if (err) {
            log.warn(err, 'read: fsCache.read failed');
            reply.error(nfs.NFS3ERR_IO);
            next(false);
            return;
        }

        // use stat.size to determine eof
        var eof = false;
        if (stats.size <= (call.offset + n)) {
            eof = true;

            // If we're at EOF, we assume we can close the FD out
            if (call.fd_cache.has(call.object))
                call.fd_cache.del(call.object);

        }

        // some NFS clients verify that the returned buffer
        // length matches the result count
        if (n < call.count)
            data = data.slice(0, n);

        log.debug('read(%s): done => %d', call.object, n);

        reply.count = n;
        reply.data = data;
        reply.eof = eof;
        reply.send();
        next();
    });
}

///--- Exports

module.exports = function chain() {
    return ([
        common.fhandle_to_filename,
        common.open,
        read
    ]);
};
