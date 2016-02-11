// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var fs = require('fs');
var nfs = require('nfs');
var common = require('./common');


///-- API

// The attrs argument has the following components which are each handled
// by a different function.
// setattr_mode
//      "mode"
// setattr_own
//      "uid"
//      "gid"
// setattr_size
//      "size"
// setattr_get_mtime - determine which mtime to use
//      "how_m_time"
//      "mtime"
// setattr_get_atime - determine which atime to use
//      "how_a_time"
//      "atime"
// setattr_time - set the mtime and atime if necessary

function setattr_mode(req, res, next) {
    var attrs = req.new_attributes;
    var log = req.log;

    log.debug('setattr_mode(%s, %d): entered', req._filename, attrs.mode);
    if (attrs.mode !== null) {
        fs.chmod(req._filename, attrs.mode, function (err) {
            if (err) {
                log.warn(err, 'setattr: chmod failed');
                res.error(nfs.NFS3ERR_SERVERFAULT);
                next(false);
                return;
            }

            log.debug('setattr: chmod done');
            next();
        });
    } else {
        log.debug('setattr: mode skip');
        next();
    }
}

function setattr_own(req, res, next) {
    var attrs = req.new_attributes;
    var log = req.log;

    log.debug('setattr_own(%s, %d %d): entered', req._filename, attrs.uid,
        attrs.gid);
    if (attrs.uid === null && attrs.gid === null) {
        log.debug('setattr: chown skip');
        next();
        return;
    }

    fs.lstat(req._filename, function (err, stats) {
        if (err) {
            log.warn(err, 'setattr: chown failed');
            res.error(nfs.NFS3ERR_SERVERFAULT);
            next(false);
            return;
        }

        var uid;
        var gid;

        if (attrs.uid !== null) {
            uid =  attrs.uid;
        } else {
            uid = stats.uid;
        }

        if (attrs.gid !== null) {
            gid =  attrs.gid;
        } else {
            gid = stats.gid;
        }

        // save the file timestamps since we did a stat
        req._mtime = stats.mtime;
        req._atime = stats.atime;

        fs.chown(req._filename, uid, gid, function (err2) {
            if (err2) {
                log.warn(err, 'setattr: chown failed');
                res.error(nfs.NFS3ERR_SERVERFAULT);
                next(false);
                return;
            }

            log.debug('setattr: chown done');
            next();
        });
    });
}

function setattr_size(req, res, next) {
    var attrs = req.new_attributes;
    var log = req.log;

    log.debug('setattr_size(%s, %d): entered', req._filename, attrs.size);
    if (attrs.size !== null) {
        fs.truncate(req._filename, attrs.size, function (err) {
            if (err) {
                log.warn(err, 'setattr: truncate failed');
                res.error(nfs.NFS3ERR_SERVERFAULT);
                next(false);
                return;
            }

            log.debug('setattr: size done');
            next();
        });
    } else {
        log.debug('setattr: size skip');
        next();
    }
}

function setattr_get_mtime(req, res, next) {
    var attrs = req.new_attributes;
    var log = req.log;

    log.debug('setattr_get_mtime(%s, %d %d): entered', req._filename,
        attrs.how_m_time, attrs.mtime);
    if (attrs.how_m_time === nfs.time_how.SET_TO_CLIENT_TIME) {
        if (attrs.mtime === null) {
            log.warn(err, 'setattr: getmtime invalid mtime');
            res.error(nfs.NFS3ERR_INVAL);
            next(false);
            return;
        }

        req._mtime = new Date(attrs.mtime.seconds * 1000);
        log.debug('setattr: mtime use client time');
        next();
        return;
    }

    if (attrs.how_m_time === nfs.time_how.SET_TO_SERVER_TIME) {
        req._mtime = new Date();
        log.debug('setattr: mtime use server time');
        next();
        return;
    }

    // already have mtime from a previous stat
    if (req._mtime !== null) {
        next();
        return;
    }

    // time_how is DONT_CHANGE but we may need the current timestamps
    fs.lstat(req._filename, function (err, stats) {
        log.debug('setattr: mtime keep');
        if (err) {
            log.warn(err, 'setattr: getmtime stat failed');
            res.error(nfs.NFS3ERR_SERVERFAULT);
            next(false);
            return;
        }

        req._mtime = stats.mtime;
        req._atime = stats.atime;
        next();
    });
}

function setattr_get_atime(req, res, next) {
    var attrs = req.new_attributes;
    var log = req.log;

    log.debug('setattr_get_atime(%s, %d %d): entered', req._filename,
        attrs.how_a_time, attrs.atime);
    if (attrs.how_a_time === nfs.time_how.SET_TO_CLIENT_TIME) {
        if (attrs.atime === null) {
            log.warn(err, 'setattr: getatime invalid mtime');
            res.error(nfs.NFS3ERR_INVAL);
            next(false);
            return;
        }

        req._atime = new Date(attrs.atime.seconds * 1000);
        log.debug('setattr: atime use client time');
        next();
        return;
    }

    if (attrs.how_a_time === nfs.time_how.SET_TO_SERVER_TIME) {
        req._atime = new Date();
        log.debug('setattr: atime use server time');
        next();
        return;
    }

    // already have atime from a previous stat
    if (req._atime !== null) {
        next();
        return;
    }

    // time_how is DONT_CHANGE but we may need the current timestamps
    fs.lstat(req._filename, function (err, stats) {
        log.debug('setattr: atime keep');
        if (err) {
            log.warn(err, 'setattr: getatime stat failed');
            res.error(nfs.NFS3ERR_SERVERFAULT);
            next(false);
            return;
        }

        req._mtime = stats.mtime;
        req._atime = stats.atime;
        next();
    });
}

function setattr_time(req, res, next) {
    var attrs = req.new_attributes;
    var log = req.log;
    var mtime;
    var atime;

    log.debug('setattr_time(%s, %d %d): entered', req._filename,
        attrs.how_m_time, attrs.how_a_time);
    if (attrs.how_m_time === nfs.time_how.DONT_CHANGE &&
        attrs.how_a_time === nfs.time_how.DONT_CHANGE) {
        // nothing to do for timestamps
        log.debug('setattr: done');
        res.send();
        next();
        return;
    }

    fs.utimes(req._filename, req._atime, req._mtime, function (err) {
        if (err) {
            log.warn(err, 'setattr: utimes failed');
            res.error(nfs.NFS3ERR_SERVERFAULT);
            next(false);
            return;
        }

        log.debug('setattr: done');
        res.send();
        next();
    });
}


///--- Exports

module.exports = function chain() {
    return ([
        common.fhandle_to_filename,
        setattr_mode,
        setattr_own,
        setattr_size,
        setattr_get_mtime,
        setattr_get_atime,
        setattr_time
    ]);
};
