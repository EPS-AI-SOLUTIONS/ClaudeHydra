#!/usr/bin/env bash
set -euo pipefail

if ! git remote >/dev/null 2>&1; then
  echo "No git remotes configured. Add one with: git remote add origin <url>" >&2
  exit 1
fi

if [ -z "$(git remote)" ]; then
  if [ -n "${GIT_REMOTE_URL:-}" ]; then
    git remote add origin "$GIT_REMOTE_URL"
  else
    echo "No git remotes configured. Set GIT_REMOTE_URL or run: git remote add origin <url>" >&2
    exit 1
  fi
fi

git push "$@"
