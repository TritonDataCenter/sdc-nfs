// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var fs = require('fs');
var nfs = require('nfs');

var common = require('./common');



///-- API

function getattr(req, res, next) {
    var log = req.log;

    log.debug('getattr(%s, %s): entered', req.object, req._filename);
    fs.stat(req._filename, function (err, stats) {
        if (err) {
            req.log.warn(err, 'getattr: stat failed');
            res.error(nfs.NFS3ERR_IO);
            next(false);
            return;
        }

        log.debug('getattr(%j): stats returned', stats);

        res.setAttributes(stats);
        res.send();
        next();
    });
}



///--- Exports

module.exports = function chain() {
    return ([
        common.fhandle_to_filename,
        getattr
    ]);
};
