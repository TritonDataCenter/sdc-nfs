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

function link_lookup_file(req, res, next) {
    var log = req.log;

    log.debug('link_lookup_file(%s): entered', req.file);
    req.fhdb.fhandle(req.file, function (err, name) {
        if (err) {
            log.warn(err, 'link_lookup_file(%s): fhandle notfound', req.file);
            res.error(nfs.NFS3ERR_STALE);
            next(false);
        } else {
            req._filename = name;
            log.debug('link_lookup_file(%s): done->%s', req.file, name);
            next();
        }
    });
}

function link_lookup_dir(req, res, next) {
    var log = req.log;

    log.debug('link_lookup_dir(%s): entered', req.link.dir);
    req.fhdb.fhandle(req.link.dir, function (err, name) {
        if (err) {
            log.warn(err, 'link_lookup_dir(%s): fhandle notfound',
                req.link.dir);
            res.error(nfs.NFS3ERR_STALE);
            next(false);
        } else {
            req._dirname = name;
            req._destname = path.join(name, req.link.name);
            log.debug('link_lookup_dir(%s): done->%s', req.link.dir, name);
            next();
        }
    });
}

function link(req, res, next) {
    var log = req.log;

    log.debug('link(%s->%s): entered', req._destname, req._filename);
    fs.link(req._filename, req._destname, function (err) {
        if (err) {
            log.warn(err, 'link(%s): failed', req._destname);
            // XXX better error return codes
            res.error(nfs.NFS3ERR_IO);
            next(false);
            return;
        }

        log.debug('link(%s): done', req._destname);
        next();
    });
}

function link_stat(req, res, next) {
    var log = req.log;

    log.debug('link_stat(%s): entered', req._destname);
    fs.lstat(req._destname, function (err, stats) {
        if (err) {
            log.warn(err, 'link_stat(%s): failed', req._destname);
            res.error(nfs.NFS3ERR_IO);
            next(false);
            return;
        }

        res.setFileAttributes(stats);
        log.debug('link_stat(%s): done', req._destname);
        res.send();
        next();
    });
}


///--- Exports

module.exports = function chain() {
    return ([
        link_lookup_file,
        link_lookup_dir,
        link,
        link_stat
    ]);
};
