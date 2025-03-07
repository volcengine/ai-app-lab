#!/bin/bash
set -ex
# shellcheck disable=SC2046
cd `dirname $0`
export PYTHONPATH="./site-packages"
exec python3 code/main.py