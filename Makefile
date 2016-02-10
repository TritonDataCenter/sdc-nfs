#
# Copyright 2016, Joyent, Inc.
#
# Makefile: for the SDC nfs service
#

#
# Tools
#
NODEUNIT	:= ./node_modules/.bin/nodeunit

#
# Files
#
DOC_FILES	 = index.restdown
JS_FILES	:= $(shell ls *.js) $(shell find lib test -name '*.js')
JSON_FILES	 = package.json
JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_FILES_NODE	 = $(JS_FILES)
JSSTYLE_FILES	 = $(JS_FILES)
JSSTYLE_FLAGS	 = -f tools/jsstyle.conf

NODE_PREBUILT_VERSION=v0.10.21

ifeq ($(shell uname -s),SunOS)
	NODE_PREBUILT_CC_VERSION=4.6.2
	NODE_PREBUILT_TAG=zone
endif

include ./tools/mk/Makefile.defs
#ifeq ($(shell uname -s),SunOS)
#	include ./tools/mk/Makefile.node_prebuilt.defs
#else
	NPM	:= npm
#endif
include ./tools/mk/Makefile.smf.defs

#
# Repo-specific targets
#
.PHONY: all
all: $(NODEUNIT) $(REPO_DEPS)
	$(NPM) rebuild

$(NODEUNIT): | $(NPM_EXEC)
	$(NPM) install

CLEAN_FILES += ./node_modules

.PHONY: test
test: $(NODEUNIT)

# XXX write new tests
#	$(NODEUNIT) test/*.test.js

include ./tools/mk/Makefile.deps
ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.targ
endif
include ./tools/mk/Makefile.smf.targ
include ./tools/mk/Makefile.targ
