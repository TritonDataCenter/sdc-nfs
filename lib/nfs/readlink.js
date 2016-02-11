// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var nfs = require('nfs');
var fs = require('fs');
var common = require('./common');


///-- API

function readlink(req, res, next) {
    var log = req.log;

    log.debug('readlink(%s, %s): entered', req.object, req._filename);
    fs.lstat(req._filename, function (err, stats) {
        if (err) {
            log.warn(err, 'readlink: lstat failed');
            res.error(nfs.NFS3ERR_IO);
            next(false);
            return;
        }

	if (!stats.isSymbolicLink()) {
            log.warn(err, 'readlink: not a symlink');
            res.error(nfs.NFS3ERR_INVAL);
            next(false);
            return;
	}

        fs.readlink(req._filename, function (l_err, val) {
            if (l_err) {
                log.warn(l_err, 'readlink: failed');
                res.error(nfs.NFS3ERR_IO);
                next(false);
                return;
            }

            log.debug('readlink(%j %s): done', stats, val);
            res.setAttributes(stats);
            res.data = val;
            res.send();
            next();
        });
    });
}

///--- Exports

module.exports = function chain() {
    return ([
        common.fhandle_to_filename,
        readlink
    ]);
};
