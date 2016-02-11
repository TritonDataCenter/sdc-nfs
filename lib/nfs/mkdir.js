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

function mkdir_lookup_dir(call, reply, next) {
    var log = call.log;

    log.debug('mkdir_lookup_dir(%s): entered', call.where.dir);
    call.fhdb.fhandle(call.where.dir, function (err, name) {
        if (err) {
            log.warn(err, 'mkdir_lookup_dir(%s): fhandle notfound',
                call.where.dir);
            reply.error(nfs.NFS3ERR_STALE);
            next(false);
        } else {
            call._dirname = name;
            call._filename = path.join(name, call.where.name);
            log.debug('mkdir_lookup_dir(%s): done -> %s', call.where.dir, name);
            next();
        }
    });
}


function mkdir_stat_dir(call, reply, next) {
    var log = call.log;

    log.debug('mkdir_stat_dir(%s): entered', call._dirname);
    fs.stat(call._dirname, function (err, stats) {
        if (err) {
            log.warn(err, 'mkdir_stat_dir(%s): failed', call._dirname);
            reply.error(nfs.NFS3ERR_IO);
            next(false);
            return;
        }
        if (!stats.isDirectory()) {
            log.warn(err, 'mkdir_stat_dir(%s): not a directory', call._dirname);
            reply.error(nfs.NFS3ERR_NOTDIR);
            next(false);
            return;
        }

        log.debug('mkdir_stat_dir(%s): done', call._dirname);
        next();
    });
}


function mkdir(call, reply, next) {
    var log = call.log;
    var mode;

    if (call.attributes.mode !== null)
        mode = call.attributes.mode;
    else
        mode = 0755;

    log.debug('mkdir(%s, %d): entered', call._filename, mode);
    fs.mkdir(call._filename, mode, function (err) {
        if (err) {
            log.warn(err, 'mkdir(%s): failed', call._filename);
            reply.error(nfs.NFS3ERR_NOTDIR);
            next(false);
            return;
        }

        // Set the owner
        fs.chown(call._filename, call.auth.uid, call.auth.gid, function (cerr) {
            if (cerr)
                call.log.warn(cerr, 'mkdir: chown failed');
            log.debug('mkdir(%s): done', call._filename);
            next();
        });
    });
}


function mkdir_lookup(call, reply, next) {
    var log = call.log;

    log.debug('mkdir_lookup(%s): entered', call._filename);
    call.fhdb.lookup(call._filename, function (err, fhandle) {
        if (err) {
            log.warn(err, 'mkdir_lookup(%s): failed', call._filename);
            reply.error(nfs.NFS3ERR_NOENT);
            next(false);
            return;
        }

        log.debug('mkdir_lookup(%s): done', fhandle);
        reply.obj = fhandle;
        next();
    });
}


function mkdir_stat_newdir(call, reply, next) {
    var log = call.log;

    log.debug('mkdir_stat_newdir(%s): entered', call._filename);
    fs.stat(call._filename, function (err, stats) {
        if (err) {
            log.warn(err, 'mkdir_stat_newdir(%s): failed', call._filename);
            reply.error(nfs.NFS3ERR_NOENT);
            next(false);
            return;
        }

        reply.setObjAttributes(stats);
        log.debug({stats: stats}, 'mkdir_stat_newdir(%s): done',
            call._filename);
        reply.send();
        next();
    });
}



///--- Exports

module.exports = function chain() {
    return ([
        mkdir_lookup_dir,
        mkdir_stat_dir,
        mkdir,
        mkdir_lookup,
        mkdir_stat_newdir
    ]);
};
