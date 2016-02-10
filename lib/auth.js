// Copyright 2013 Joyent, Inc.  All rights reserved.
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.



///--- API

function  authorize(req, res, next) {
    // Let everything through
    // if (!req.is_user(0)) {
    //     res.status = nfs.NFS3ERR_ACCES;
    //     res.send();
    //     next(false);
    // } else {
    //     next();
    // }
    next();
}



///--- Exports

module.exports = {
    authorize: authorize
};
