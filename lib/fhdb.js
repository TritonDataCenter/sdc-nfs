// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var events = require('events');
var fs = require('fs');
var path = require('path');
var util = require('util');
var vasync = require('vasync');

var assert = require('assert-plus');
var levelup = require('levelup');
var once = require('once');
var uuid = require('node-uuid');


///--- Globals

var sprintf = util.format;

var DB_NAME = 'fh.db';

// DB key for pathname to uuid mapping
var FHANDLE_KEY_FMT = ':fh:%s';
// DB key for uuid to pathname mapping
var FNAME_KEY_FMT = ':fn:%s';

// file handle mapping

// XXX need comment
//


///--- API

function fhdb(opts) {
    assert.object(opts, 'options');
    assert.object(opts.log, 'options.log');
    assert.string(opts.location, 'options.location');

    events.EventEmitter.call(this, opts);

    this.db = null;
    this.log = opts.log.child({
        component: 'fhandleDB',
        location: path.normalize(opts.location)
    }, true);
    this.location = path.normalize(opts.location);

    this._fhdb = true; // MDB flag

    this.open();
}
util.inherits(fhdb, events.EventEmitter);
module.exports = fhdb;


fhdb.prototype.fhandle = function fhandle(fh, cb) {
    assert.string(fh, 'fhandle');
    assert.func(cb, 'callback');

    cb = once(cb);

    var k = sprintf(FNAME_KEY_FMT, fh);
    var log = this.log;
    var self = this;

    log.trace('fhandle(%s): entered', fh);
    self.db.get(k, function (err, fname) {
        if (err) {
            log.trace(err, 'fhandle(%s): error', fh);
            cb(err);
        } else {
            log.trace('fhandle(%s): done => %s', fh, fname);
            cb(null, fname);
        }
    });
};


fhdb.prototype.lookup = function lookup(p, cb) {
    assert.string(p, 'path');
    assert.func(cb, 'callback');

    cb = once(cb);

    var log = this.log;
    var self = this;

    log.trace('lookup(%s): entered', p);
    var k1 = sprintf(FHANDLE_KEY_FMT, p);
    self.db.get(k1, function (err, _fhandle) {
        if (!err) {
	    // already there
            log.trace('lookup(%s): done => %s', p, _fhandle);
            cb(null, _fhandle);
            return;
        }

        fs.stat(p, function (s_err, stats) {
            if (s_err) {
                cb(s_err);
                return;
            }

            // Existing file, create a file handle for it
            var _fh = uuid.v4();
            var k2 = sprintf(FNAME_KEY_FMT, _fh);
            self.db.batch()
                .put(k1, _fh)
                .put(k2, p)
                .write(function onBatchWrite(err2) {
                    if (err2) {
                        log.trace(err2, 'lookup(%s): failed', p);
                        cb(err2);
                    } else {
                        log.trace('lookup(%s): done => %s', p, _fh);
                        cb(null, _fh);
                    }
            });
        });
    });
};


// This code takes care of cleaning up the old existing fhandle that might be
// in the db and sets up the bookkeeping data for the new file.
// The new file keeps the old file's fhandle.
fhdb.prototype.mv = function mv(oldpath, newpath, cb) {
    assert.string(oldpath, 'oldpath');
    assert.string(newpath, 'newpath');
    assert.func(cb, 'callback');

    var self = this;
    var log = this.log;

    log.trace('cache mv(%s, %s): entered', oldpath, newpath);

    // We can't use self.put here since we need to force the use of the old
    // _fhandle; update the db directly.
    function update_db(p, _fhandle, _cb) {
        var k1 = sprintf(FHANDLE_KEY_FMT, p);
        var k2 = sprintf(FNAME_KEY_FMT, _fhandle);

        self.db.batch()
            .put(k1, _fhandle)
            .put(k2, p)
            .write(function onBatchWrite(err2) {
                if (err2) {
                    log.error(err2, 'update_db(%s): failed', p);
                    _cb(err2);
                } else {
                    log.trace('update_db(%s): done', p);
                    _cb(null);
                }
            });
    }

    function cleanup() {
        var fhk = sprintf(FHANDLE_KEY_FMT, oldpath);
        // we can't delete the FNAME_KEY_FMT entry since that is already
        // setup to refer to the renamed file
        self.db.batch()
            .del(fhk)
            .write(function onBatchDel(err) {
                if (err) {
                    log.error(err, 'mv del %s: failed', oldpath);
                    cb(err);
                } else {
                    cb(null);
                }
            });
    }

    var k1 = sprintf(FHANDLE_KEY_FMT, oldpath);
    self.db.get(k1, function (err, _fhandle) {
        if (!err) {
            // We can't use self.put here since we need to force the use
            // of the old _fhandle; update the db directly.
            update_db(newpath, _fhandle, function (u_err) {
                if (u_err) {
                    cb(u_err);
                    return;
                }
                cleanup();
            });
        } else {
            // oldpath not there
            var _fh = uuid.v4();
            update_db(newpath, _fh, function (u_err) {
                if (u_err) {
                    cb(u_err);
                    return;
                }
                cb(null);
            });
        }

    });
};


fhdb.prototype.del = function del(p, cb) {
    assert.string(p, 'path');
    assert.func(cb, 'callback');

    cb = once(cb);

    var log = this.log;
    var self = this;
    var fhk = sprintf(FHANDLE_KEY_FMT, p);

    log.trace('del(%s): entered', p);
    self.db.get(fhk, function (err, _fhandle) {
        if (err) {
            log.error(err, 'del(%s): failed', p);
            cb(err);
            return;
        }

        if (!_fhandle) {
            cb();
            return;
        }

        var fnk = sprintf(FNAME_KEY_FMT, _fhandle);
        self.db.batch()
            .del(fhk)
            .del(fnk)
            .write(function onBatchDel(err2) {
                if (err2) {
                    log.error(err2, 'del(%s): failed', p);
                    cb(err2);
                }
                cb(null);
            });
    });
};


//-- Open/Close stuff not mainline

fhdb.prototype.open = function open() {
    var db_location = path.join(this.location, DB_NAME);
    var log = this.log;
    var self = this;

    log.debug('open: entered');

    fs.mkdir(this.location, 0700, function (err) {
        fs.mkdir(db_location, 0700, function (err2) {
            self.db = levelup(db_location, {
                valueEncoding: 'json'
            });

            self.db.on('error', self.emit.bind(self, 'error'));
            self.db.once('ready', function onDatabase() {
                log.debug('open: done');
                self.emit('ready');
            });
        });
    });
};


fhdb.prototype.close = function close(cb) {
    assert.optionalFunc(cb, 'callback');

    var log = this.log;
    var self = this;

    var _cb = once(function (err) {
        if (err) {
            log.error(err, 'close: failed');
            if (cb) {
                cb(err);
            } else {
                self.emit('error', err);
            }
        } else {
            log.debug(err, 'close: done');
            self.emit('close');
            if (cb)
                cb();
        }
    });

    log.debug('close: entered');

    if (this.db) {
        this.db.close(_cb);
    } else {
        _cb();
    }
};


fhdb.prototype.toString = function toString() {
    var str = '[object ' +
        this.constructor.name + '<' +
        'location=' + this.location + '>]';

    return (str);
};
