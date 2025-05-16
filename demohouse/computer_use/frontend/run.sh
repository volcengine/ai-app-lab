#!/bin/bash
set -ex
cd `dirname $0`

export RUNTIME_LOGDIR=/opt/tiger/toutiao/log
export PORT=${_BYTEFAAS_RUNTIME_PORT:-8000}
export HOSTNAME="0.0.0.0"
exec node .next/standalone/server.js