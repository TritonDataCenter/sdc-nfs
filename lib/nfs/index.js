// Copyright 2016 Joyent, Inc.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

var path = require('path');

var assert = require('assert-plus');
var nfs = require('nfs');

var auth = require('../auth');

var access = require('./access');
var create = require('./create');
var commit = require('./commit');
var fsinfo = require('./fsinfo');
var fsstat = require('./fsstat');
var getattr = require('./getattr');
var link = require('./link');
var lookup = require('./lookup');
var mkdir = require('./mkdir');
var mknod = require('./mknod');
var pathconf = require('./pathconf');
var read = require('./read');
var readdir = require('./readdir');
var readdirplus = require('./readdirplus');
var readlink = require('./readlink');
var remove = require('./remove');
var rename = require('./rename');
var rmdir = require('./rmdir');
var setattr = require('./setattr');
var symlink = require('./symlink');
var write = require('./write');



///--- API

function createNfsServer(opts) {
    assert.object(opts, 'options');
    assert.object(opts.fd_cache, 'options.fd_cache');
    assert.object(opts.fhdb, 'options.fhdb');
    assert.object(opts.log, 'options.log');
    assert.string(opts.vfspath, 'options.vfspath');
    assert.optionalObject(opts.hosts_allow, 'options.hosts_allow');
    assert.optionalObject(opts.hosts_deny, 'options.hosts_deny');

    // We have to check that each incoming NFS request is from an acceptable
    // host since each request is independent and there nothing that ties
    // the check we did in mountd to a request.
    function host_allowed(req, res) {
        assert.object(req.connection, 'req.connection');

        var ipaddr = req.connection.remoteAddress;

        // hosts_deny entries are optional
        // if the address is present, disallow the mount
        if (req.hosts_deny && req.hosts_deny[ipaddr]) {
            req.log.warn('nfsd request from (%s) denied', ipaddr);
            res.error(nfs.MNT3ERR_ACCES);
            return (false);
        }

        // hosts_allow entries are optional
        // if hosts_allow exists, then the address must be preset or we disallow
        // the mount
        if (req.hosts_allow && !req.hosts_allow[ipaddr]) {
            req.log.warn('nfsd request from (%s) was not allowed', ipaddr);
            res.error(nfs.MNT3ERR_ACCES);
            return (false);
        }

        return (true);
    }

    var s = nfs.createNfsServer({
        log: opts.log
    });

    s.use(auth.authorize);
    s.use(function setup(req, res, next) {
        req.hosts_allow = opts.hosts_allow;
        req.hosts_deny = opts.hosts_deny;
        if (!host_allowed(req, res)) {
            next(false);
            return;
        }

        req.fd_cache = opts.fd_cache;
        req.fhdb = opts.fhdb;
        req.vfspath = opts.vfspath;	// needed for fsstat
        next();
    });

    s.access(access());
    s.create(create());
    s.commit(commit());
    s.fsinfo(fsinfo());
    s.fsstat(fsstat());
    s.getattr(getattr());
    s.link(link());
    s.lookup(lookup());
    s.mkdir(mkdir());
    s.mknod(mknod());
    s.pathconf(pathconf());
    s.read(read());
    s.readdir(readdir());
    s.readdirplus(readdirplus());
    s.readlink(readlink());
    s.remove(remove());
    s.rename(rename());
    s.rmdir(rmdir());
    s.setattr(setattr());
    s.symlink(symlink());
    s.write(write());

    s.on('after', function (name, call, reply, err) {
        opts.log.debug({
            procedure: name,
            rpc_call: call,
            rpc_reply: reply,
            err: err
        }, 'nfsd: %s handled', name);
    });

    return (s);
}



///--- Exports

module.exports = {
    createNfsServer: createNfsServer
};
