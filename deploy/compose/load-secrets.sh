#!/bin/sh
# Exports every mounted Docker secret (/run/secrets/NAME) as $NAME, then
# execs the real command. Secrets reach the process environment at start-up
# only; they are never baked into an image, an .env file or the compose file.
set -eu
for f in /run/secrets/*; do
  [ -f "$f" ] || continue
  name="$(basename "$f")"
  value="$(cat "$f")"
  export "$name=$value"
done
exec "$@"
