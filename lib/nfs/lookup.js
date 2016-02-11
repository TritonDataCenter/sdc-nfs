// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var fs = require('fs');
var nfs = require('nfs');
var path = require('path');

var common = require('./common');



///-- API

function lookup_dir(call, reply, next) {
    var log = call.log;

    log.debug('lookup_dir(%s): entered', call.what.dir);
    call.fhdb.fhandle(call.what.dir, function (err, name) {
        if (err) {
            log.debug(err, 'lookup_dir(%s): fhandle notfound',
                call.what.dir);
            reply.error(nfs.NFS3ERR_STALE);
            next(false);
        } else {
            call._dirname = name;
            call._filename = path.join(name, call.what.name);
            log.debug('lookup_dir(%s): done -> %s', call.what.dir, name);
            next();
        }
    });
}


function stat_file(call, reply, next) {
    var log = call.log;

    log.debug('stat_file(%s): entered', call._filename);
    fs.lstat(call._filename, function (err, stats) {
        if (err) {
            log.debug(err, 'stat_file(%s): failed', call._filename);
            reply.error(nfs.NFS3ERR_NOENT);
            next(false);
        } else {
            // reply.object = uuid;
            reply.setAttributes(stats);
            log.debug({stats: stats}, 'stat_file(%s): done', call._filename);
            next();
        }
    });
}


function stat_dir(call, reply, next) {
    var log = call.log;

    log.debug('stat_dir(%s): entered', call._dirname);
    fs.stat(call._dirname, function (err, stats) {
        if (err) {
            log.debug(err, 'stat_dir(%s): failed', call._dirname);
            reply.error(nfs.NFS3ERR_IO);
            next(false);
        } else {
            reply.setDirAttributes(stats);
            log.debug({stats: stats}, 'stat_dir(%s): done', call._dirname);
            next();
        }
    });
}


function lookup(call, reply, next) {
    var log = call.log;

    log.debug('lookup(%s): entered', call._filename);
    call.fhdb.lookup(call._filename, function (err, fhandle) {
        if (err) {
            log.debug(err, 'lookup(%s): failed', call._filename);
            reply.error(nfs.NFS3ERR_NOENT);
            next(false);
            return;
        }
        reply.object = fhandle;
        reply.send();
        next();
    });
}



///--- Exports

module.exports = function chain() {
    return ([
        function cheat(call, reply, next) {
            call._object_override = call.what.dir;
            next();
        },
        lookup_dir,
        stat_dir,
        stat_file,
        lookup
    ]);
};
