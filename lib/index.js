// Copyright 2013 Joyent, Inc.  All rights reserved.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var fs = require('fs');
var path = require('path');

var assert = require('assert-plus');
var bunyan = require('bunyan');
var once = require('once');
var fhdb = require('./fhdb');



///--- Helpers

function _export(obj) {
    Object.keys(obj).forEach(function (k) {
        module.exports[k] = obj[k];
    });
}



///--- API

var BUNYAN_SERIALIZERS = {
    err: bunyan.stdSerializers.err,
    rpc_call: function serialize_rpc_call(c) {
        return (c ? c.toString() : null);
    },
    rpc_reply: function serialize_rpc_reply(r) {
        return (r ? r.toString() : null);
    }
};


function createLogger(name, stream) {
    var l = bunyan.createLogger({
        name: name || path.basename(process.argv[1]),
        level: process.env.LOG_LEVEL || 'error',
        stream: stream || process.stdout,
        serializers: BUNYAN_SERIALIZERS
    });

    return (l);
}

function createFHDB(opts) {
    assert.optionalObject(opts, 'options');

    var log = opts.log || bunyan.createLogger({
        stream: process.stderr,
        level: process.env.LOG_LEVEL || 'warn',
        name: 'fhdb',
        serializers: bunyan.stdSerializers
    });

    return (new fhdb({
        location: opts.path || '/var/tmp/sdcnfs',
        log: log
    }));
}

///--- Exports

module.exports = {
    bunyan: {
        createLogger: createLogger,
        serializers: BUNYAN_SERIALIZERS
    },
    createLogger: createLogger,
    createFHDB: createFHDB
};

_export(require('./fhdb'));
_export(require('./mount'));
_export(require('./nfs'));
_export(require('./portmap'));
