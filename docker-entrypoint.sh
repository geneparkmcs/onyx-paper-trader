#!/bin/sh
set -e

# Apply migrations to the SQLite db on the mounted volume, then start the server.
echo "→ applying migrations (DATABASE_URL=$DATABASE_URL)"
node_modules/.bin/prisma migrate deploy

echo "→ starting Next.js on port ${PORT:-3000}"
exec node_modules/.bin/next start -p "${PORT:-3000}" -H 0.0.0.0
