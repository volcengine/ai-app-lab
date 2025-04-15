#!/bin/bash
set -ex
# shellcheck disable=SC2046
cd `dirname $0`
export PYTHONPATH=$PYTHONPATH:./site-packages

exec python3 main.py