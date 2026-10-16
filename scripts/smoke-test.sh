#!/usr/bin/env bash
# Creates an author through the GraphQL API of the running app and fails unless it gets an id back.
#   scripts/smoke-test.sh [http://localhost:3000/graphql]
set -euo pipefail

url="${1:-http://localhost:3000/graphql}"
email="smoke-$(date +%s)-$RANDOM@example.com"
query="mutation { createAuthors(input: { fullName: \\\"Smoke\\\", email: \\\"$email\\\" }) { id fullName email } }"

response=$(curl -sS "$url" -H 'content-type: application/json' -d "{\"query\":\"$query\"}")
echo "$response"
node -e '
  const { data, errors } = JSON.parse(process.argv[1]);
  if (errors || !data?.createAuthors?.id) process.exit(1);
' "$response"
