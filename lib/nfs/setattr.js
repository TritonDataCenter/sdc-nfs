// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var fs = require('fs');
var nfs = require('nfs');

var common = require('./common');



///-- API

// We implement setattr only for the special cases of:
// - truncating an existing file down to 0 (i.e. when its being overwritten).
// - chmod/chown (we just lie)
// XXX needs to be updated
//
function setattr(req, res, next) {
    var attrs = req.new_attributes;
    var log = req.log;

    log.debug('setattr(%s, %d): entered', req.object, req.new_attributes.size);

    if (attrs.how_m_time === nfs.time_how.SET_TO_CLIENT_TIME) {
        // The client is touching the file. We use this as an indication to
        // refresh the cached data. We don't need to worry about supplying
        // valid times for atime and mtime here, and we still tell the client
        // that this is an error.
        fs.utimes(req._filename, 0, 0, function (err) {
            if (err) {
                log.warn(err, 'setattr: utimes failed');
                res.error(nfs.NFS3ERR_SERVERFAULT);
            } else {
                res.error(nfs.NFS3ERR_ACCES);
            }
            next(false);
        });
        return;
    }

    // XXX fix comments
    // If attrs.how_a_time or attrs.how_m_time is SET_TO_SERVER_TIME we just
    // ignore that. Some apps, such as vi, seem to initiate that.
    // We also ignore attrs.mode, attrs.uid and attrs.gid since we can't
    // change those either but various apps try.

    // OK, we're setting the file size
    if (attrs.size !== null) {
        fs.truncate(req._filename, attrs.size, function (err) {
            if (err) {
                log.warn(err, 'setattr: truncate failed');
                res.error(nfs.NFS3ERR_SERVERFAULT);
                next(false);
                return;
            }

            log.debug('setattr: done');
            res.send();
            next();
        });
    } else {
        log.debug('setattr: done');
        res.send();
        next();
    }
}


///--- Exports

module.exports = function chain() {
    return ([
        common.fhandle_to_filename,
        setattr
    ]);
};
