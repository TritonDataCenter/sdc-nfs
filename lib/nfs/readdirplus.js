// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var path = require('path');
var fs = require('fs');
var nfs = require('nfs');
var vasync = require('vasync');
var common = require('./common');
var rpc = require('oncrpc');
var XDR = rpc.XDR;

///--- Helpers

function rand() {
    return (Math.floor((Math.random() * Math.pow(2, 31)) + 1));
}



///-- API

function readdirplus(call, reply, next) {
    var log = call.log;
    log.debug('readdirplus(%s): entered', call._filename);

    var error = null;
    var cook = 1;

    // Track the returned data size
    // status (4) + bool_dir_attrs (4) + fattr3.XDR_SIZE +
    // cookieverf3 (8) + bool_eof (4) + final_list_false (4)
    // See nfs readdirplus_reply.js.
    var totsz = 116;

    // total dir entries size, not including attributes and file handle portion
    var sz = 0;

    function process_entry(fname, nextent) {
        // The call cookie will be 0 on the initial call
        if (call.cookie != 0 && call.cookie >= cook) {
            // we need to scan the dir until we reach the right entry
            cook++;
            nextent();
            return;
        }

        if (reply.eof === false || error) {
            // We hit our return limit on a previous entry, skip the rest
            nextent();
            return;
        }

        // We need to track the basic returned data size to be sure we fit in
        // call.dircount bytes.
        // list_true (4) + fileid (8) + cookie (8) + name_len
        var delta = 20 + XDR.byteLength(fname);
        if ((sz + delta) > call.dircount) {
            reply.eof = false;
            nextent();
            return;
        }
        sz += delta;

        // We also need to track the total returned data size to be sure we
        // fit in call.maxcount bytes.
        // list_true (4) + fileid (8) + cookie (8) + name_len +
        // bool_name_attr (4) + name_attr_len +
        // bool_name_handle (4) + name_handle_len
        delta = 28 + XDR.byteLength(fname) + 84 + 64;
        if ((totsz + delta) > call.maxcount) {
            reply.eof = false;
            nextent();
            return;
        }
        totsz += delta;

        var p = path.join(call._filename, fname);
        fs.stat(p, function (err2, stats) {
            if (err2) {
                log.warn(err2, 'readdirplus(%s): stat failed', p);
                error = error || nfs.NFS3ERR_IO;
                nextent();
            } else {
                call.fhdb.lookup(p, function (err3, fhandle) {
                    if (err3) {
                        log.warn(err3, 'readdirplus(%s): lu failed', p);
                        error = error || nfs.NFS3ERR_IO;
                    } else {
                        reply.addEntry({
                            fileid: common.hash(p),
                            name: fname,
                            cookie: cook++,
                            name_attributes: nfs.create_fattr3(stats),
                            name_handle: fhandle
                        });
                    }
                    nextent();
                });
            }
        });
    }

    function all_done() {
        if (error) {
            reply.error(error);
            next(false);
        } else {
            fs.stat(call._filename, function (err, stats) {
                if (err) {
                    log.warn(err, 'readdirplus(%s): dir stat failed',
                         call._filename);
                } else {
                    reply.setDirAttributes(stats);
                }
                log.debug('readdirplus(%s): done', call._filename);
                reply.send();
                next();
            });
        }
    }

    fs.readdir(call._filename, function (err1, files) {
        if (err1) {
            log.warn(err1, 'readdirplus(%s): rd failed', call._filename);
            error = (err1.code === 'ENOTDIR' ?
                        nfs.NFS3ERR_NOTDIR :
                        nfs.NFS3ERR_IO);
            reply.error(error);
            next(false);
            return;
        }

        // The cookieverf will be 0 on the initial call.
        var h = common.hash(call._filename);
        if (call.cookieverf.readUInt32LE(0) != 0) {
            // This is a follow-up call, confirm cookie.
            if (call.cookieverf.readUInt32LE(0) != h) {
                reply.error(nfs.NFS3ERR_BAD_COOKIE);
                next(false);
                return;
            }
        }

        reply.eof = true;

        reply.cookieverf = new Buffer(8);
        reply.cookieverf.fill(0);
        reply.cookieverf.writeUInt32LE(h, 0, true);

        vasync.forEachPipeline({
            'func': process_entry,
            'inputs': files
        }, all_done);
    });
}



///--- Exports

module.exports = function chain() {
    return ([
        common.fhandle_to_filename,
        readdirplus
    ]);
};
