#!/bin/bash
# Block skill usage when the repo-local gstack vendor is missing or unbuilt.

GSTACK_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/skills/gstack"

if [ ! -d "$GSTACK_DIR/bin" ]; then
  cat >&2 <<MSG
BLOCKED: gstack is missing from this repo.

This repo vendors gstack at .claude/skills/gstack/. It looks like that
directory is missing or wasn't checked out.

Recover it:
  git fetch && git checkout -- .claude/skills/gstack

If it really isn't tracked, re-clone gstack into the repo:
  git clone --depth 1 https://github.com/garrytan/gstack.git \\
    "\$CLAUDE_PROJECT_DIR/.claude/skills/gstack"
  rm -rf "\$CLAUDE_PROJECT_DIR/.claude/skills/gstack/.git"
  "\$CLAUDE_PROJECT_DIR/.claude/skills/gstack/setup"
MSG
  echo '{"permissionDecision":"deny","message":"gstack is required but missing from this repo. See stderr."}'
  exit 0
fi

if [ ! -x "$GSTACK_DIR/browse/dist/browse" ]; then
  cat >&2 <<MSG
BLOCKED: gstack is present but not built.

Run setup to build the bundled binaries:
  "\$CLAUDE_PROJECT_DIR/.claude/skills/gstack/setup"
MSG
  echo '{"permissionDecision":"deny","message":"gstack needs setup. See stderr."}'
  exit 0
fi

echo '{}'
