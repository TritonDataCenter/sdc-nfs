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

function create_lookup_dir(call, reply, next) {
    var log = call.log;

    log.debug('create_lookup_dir(%s): entered', call.where.dir);
    call.fhdb.fhandle(call.where.dir, function (err, name) {
        if (err) {
            log.warn(err, 'create_lookup_dir(%s): fhandle notfound',
                call.where.dir);
            reply.error(nfs.NFS3ERR_STALE);
            next(false);
        } else {
            call._dirname = name;
            call._filename = path.join(name, call.where.name);
            log.debug('create_lookup_dir(%s): done -> %s', call.where.dir,
                name);
            next();
        }
    });
}


function do_create(flags, call, reply, next) {
    var mode = call.obj_attributes.mode;

    // mode is null when call.how === nfs.create_how.EXCLUSIVE
    if (mode === null)
        mode = 0644;

    // We don't use the fd cache here since that only works with existing files
    // and always opens with the 'r+' flag. We need to create the file here
    // with either the 'w' or 'wx' flags.
    fs.open(call._filename, flags, mode, function (open_err, fd) {
        if (open_err) {
            call.log.warn(open_err, 'create: open failed');
            reply.error(nfs.NFS3ERR_SERVERFAULT);
            next(false);
            return;
        }

        // Passing the mode on fs.open doesn't set the correct mode. This could
        // be a node.js bug for a specific release. Explicitly set the mode as
        // a workaround.
        fs.fchmod(fd, mode, function (err) {
            // we're ignoring errors on chmod/chown/close
            if (err)
                call.log.warn(err, 'create: chmod failed');

            // Set the owner
            fs.fchown(fd, call.auth.uid, call.auth.gid,
                function (c_err) {

                if (c_err)
                    call.log.warn(c_err, 'create: chown failed');
                fs.close(fd, function (close_err) {
                    next();
                });
            });
        });
    });
}


function create(call, reply, next) {
    var log = call.log;

    log.debug('create(%s, %d): entered', call.object, call.how);

    if (call.how === nfs.create_how.EXCLUSIVE) {
        fs.stat(call._filename, function (err, stats) {
            if (err && err.code === 'ENOENT') {
                // This is the "normal" code path (i.e. non-error)
                do_create('wx', call, reply, next);
            } else {
                log.debug('create (exclusive) file exists');
                reply.error(nfs.NFS3ERR_EXIST);
                next(false);
            }
        });
    } else if (call.how === nfs.create_how.UNCHECKED) {
        do_create('w', call, reply, next);
    } else {    // call.how === nfs.create_how.GUARDED
        fs.stat(call._filename, function (err, stats) {
            if (err && err.code === 'ENOENT') {
                // This is the "normal" code path (i.e. non-error)
                do_create('w', call, reply, next);
            } else {
                log.debug('create (guarded) file exists');
                reply.error(nfs.NFS3ERR_EXIST);
                next(false);
            }
        });
    }
}


function create_lookup(call, reply, next) {
    var log = call.log;

    log.debug('create_lookup(%s): entered', call._filename);
    call.fhdb.lookup(call._filename, function (err, fhandle) {
        if (err) {
            log.warn(err, 'create_lookup(%s): failed', call._filename);
            reply.error(nfs.NFS3ERR_NOENT);
            next(false);
            return;
        }

        log.debug('create_lookup(%s): done', fhandle);
        reply.obj = fhandle;

        next();
    });
}


function create_stat(call, reply, next) {
    var log = call.log;

    log.debug('create_stat(%s): entered', call._filename);
    fs.stat(call._filename, function (err, stats) {
        if (err) {
            log.warn(err, 'create_stat(%s): failed', call._filename);
            reply.error(nfs.NFS3ERR_NOENT);
            next(false);
            return;
        }

        reply.setObjAttributes(stats);
        log.debug({stats: stats}, 'create_stat(%s): done', call._filename);
        reply.send();
        next();
    });
}


///--- Exports

module.exports = function chain() {
    return ([
        create_lookup_dir,
        create,
        create_lookup,
        create_stat
    ]);
};
