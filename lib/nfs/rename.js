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

function rename_get_from_dir(call, reply, next) {
    var log = call.log;

    log.debug('rename_get_from_dir(%s): entered', call.from.dir);
    call.fhdb.fhandle(call.from.dir, function (err, name) {
        if (err) {
            log.warn(err, 'rename_get_from_dir(%s): fhandle notfound',
                call.from.dir);
            reply.error(nfs.NFS3ERR_STALE);
            next(false);
            return;
        }

        call._from_dirname = name;
        call._from_filename = path.join(name, call.from.name);
        log.debug('rename_get_from_dir(%s): done -> %s', call.from.dir, name);
        next();
    });
}


function rename_get_to_dir(call, reply, next) {
    var log = call.log;

    log.debug('rename_get_to_dir(%s): entered', call.to.dir);
    call.fhdb.fhandle(call.to.dir, function (err, name) {
        if (err) {
            log.warn(err, 'rename_get_to_dir(%s): fhandle notfound',
                call.to.dir);
            reply.error(nfs.NFS3ERR_STALE);
            next(false);
            return;
        }

        call._to_dirname = name;
        call._to_filename = path.join(name, call.to.name);
        log.debug('rename_get_to_dir(%s): done -> %s', call.to.dir, name);
        next();
    });
}


// Check if trying to rename a directory. This is not supported.
function rename_stat_from(call, reply, next) {
    var log = call.log;

    log.debug('rename_stat_from(%s): entered', call._dirname);
    fs.stat(call._from_filename, function (err, stats) {
        if (err) {
            log.warn(err, 'rename_stat_from(%s): failed', call._from_filename);
            reply.error(nfs.NFS3ERR_IO);
            next(false);
            return;
        }

        if (stats.isDirectory()) {
            log.debug('rename_stat_from(%s): is a directory',
                call._from_filename);
            reply.error(nfs.NFS3ERR_ISDIR);
            next(false);
            return;
        }

        log.debug('rename_stat_from(%s): done', call._from_filename);
        next();
    });
}

function rename(call, reply, next) {
    var log = call.log;

    log.debug('rename(%s -> %s): entered',
        call._from_filename, call._to_filename);
    fs.rename(call._from_filename, call._to_filename, function (err) {
        if (err) {
            log.warn(err, 'rename(%s, %s): failed', call._from_filename,
                call._to_filename);
            reply.error(nfs.NFS3ERR_NOENT);
            next(false);
            return;
        }

        // update the file handle
        call.fhdb.mv(call._from_filename, call._to_filename, function (d_err) {
            if (d_err) {
                log.warn(d_err, 'rename(%s, %s): mv fh failed',
                    call._from_filename, call._to_filename);
                common.handle_error(d_err, call, reply, next);
            } else {
                log.debug('rename: done');
                reply.send();
                next();
            }
        });
    });
}



///--- Exports

module.exports = function chain() {
    return ([
        rename_get_from_dir,
        rename_get_to_dir,
        rename_stat_from,
        rename
    ]);
};
