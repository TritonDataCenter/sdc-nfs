// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var fs = require('fs');
var nfs = require('nfs');
var common = require('./common');


///-- API

function access(req, res, next) {
    var log = req.log;

    log.debug('access(%s, %s): entered', req.object, req._filename);
    fs.stat(req._filename, function (err, stats) {
        if (err) {
            req.log.warn(err, 'access: fs.stat failed');
            res.error(nfs.NFS3ERR_IO);
            next(false);
            return;
        }

        log.debug('access(%j): stats returned', stats);

        res.setAttributes(stats);

        // Allow root to do anything (even though easily spoofed).
        // Also allow owner to do anything no matter what mode (see the NFSv3
        // RFC 1813 for explanation).
        if (req.auth.uid == 0 || req.auth.uid == stats.uid) {
            res.access =
                nfs.ACCESS3_READ    |
                nfs.ACCESS3_LOOKUP  |
                nfs.ACCESS3_MODIFY  |
                nfs.ACCESS3_EXTEND  |
                nfs.ACCESS3_DELETE  |
                nfs.ACCESS3_EXECUTE;
            log.debug('access: %s done %d', req._filename, res.access);
            res.send();
            next();
            return;
        }

        // Not root or owner, check "other" mode.
        // XXX TBD The caller can pass in a subset to check.
        // XXX TBD ignoring gid for now.
        // XXX Fix Check parent dir for ACCESS3_DELETE and ACCESS3_LOOKUP.
        res.access = 0;
        if (stats.mode & 0100)
            res.access |= nfs.ACCESS3_READ;
        if (stats.mode & 010)
            res.access |= nfs.ACCESS3_MODIFY | nfs.ACCESS3_EXTEND |
                nfs.ACCESS3_DELETE;
        if (stats.mode & 01)
            res.access |= nfs.ACCESS3_LOOKUP | nfs.ACCESS3_EXECUTE;

        log.debug('access: %s done %d', req._filename, res.access);
        res.send();
        next();
    });
}


///--- Exports

module.exports = function chain() {
    return ([
        common.fhandle_to_filename,
        access
    ]);
};
