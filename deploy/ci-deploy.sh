#!/usr/bin/env bash
# The ONLY command the GitHub deploy key may run (forced in authorized_keys). It ignores whatever
# the caller asks for and just runs the normal, safe update.
exec /bin/bash /opt/mad-app/deploy/update.sh
