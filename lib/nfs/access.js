// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var fs = require('fs');
var nfs = require('nfs');

var common = require('./common');



///-- API

function access_getattr(req, res, next) {
    var log = req.log;

    log.debug('access_getattr(%s, %s): entered', req.object, req._filename);
    fs.stat(req._filename, function (err, stats) {
        if (err) {
            req.log.warn(err, 'access_getattr: fs.stat failed');
            res.error(nfs.NFS3ERR_IO);
            next(false);
            return;
        }

        log.debug('access_getattr(%j): stats returned', stats);

        res.setAttributes(stats);
        next();
    });
}


function access(call, reply, next) {
    reply.access =
        nfs.ACCESS3_READ    |
        nfs.ACCESS3_LOOKUP  |
        nfs.ACCESS3_MODIFY  |
        nfs.ACCESS3_EXTEND  |
        nfs.ACCESS3_DELETE  |
        nfs.ACCESS3_EXECUTE;
    reply.send();
    next();
}



///--- Exports

module.exports = function chain() {
    return ([
        common.fhandle_to_filename,
        access_getattr,
        access
    ]);
};
