#!/bin/sh
set -eu
node /app/server.mjs &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' EXIT INT TERM
tor -f /app/torrc
