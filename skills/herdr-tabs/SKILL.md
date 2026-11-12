---
name: herdr-tabs
description: Inside the Herdr app (`herdr-app status` answers), open a worker tab with its own Claude, in this same space by default, for a separate task instead of doing it in this conversation. Use when the user asks to open a tab or space for something ("відкрий таб для…", "open a tab where we'll work on…"), or asks for something that clearly drifts from this tab's topic and would make a session of its own (another project, a separate feature or bug, a long job); then watch it and come back with its result. Not for small, quick things or for continuing the current topic.
---

# A separate task → a new Herdr tab or space

Only inside Herdr: `herdr-app status` prints JSON (with `"space"`, the space in front). If it
fails, Herdr isn't running here: work as usual. Never start Herdr or the `hc` server yourself
(`open`, `hc server start`, `hc machine add`): a core started from a Claude session inherits its
environment, and Claude in Herdr stops saving conversations.

## Where: a worker tab in this space

A space is a project: this tab is its orchestrator, the other tabs are its workers. So by
default the new task is **a new tab in the space this Claude runs in**, even when the space has
another name, and even for a big job:

    S=$(python3 ~/.claude/skills/herdr-tabs/here.py | python3 -c 'import json,sys; print(json.load(sys.stdin)["space"])')
    herdr-app do tab.new "{\"space\": \"$S\", \"name\": \"...\", \"folder\": \"...\", \"argv\": [...]}"

(`here.py` finds this Claude's own terminal; not `herdr-app status`, which is whatever space
is in front.) If the user names another space («у воркспейсі АпМап»), find it in
`herdr-app ls` by name and open the tab there. Only when they ask for a new space (a new
project of its own: «новий воркспейс», «окремий простір») use
`herdr-app do space.new '{"name": "...", "folder": "...", "argv": [...]}'`.

Both print JSON with `terminal` (e.g. `t42`); keep it. Name the tab after the task, short. The
folder is the project's (the vault's MAP.md → «Код», or `~/code/<name>`).

## How

1. **Write a brief** to a file in your scratchpad, with a quoted heredoc (`<<'EOF'`; unquoted,
   backticks run). It stands on its own, the new Claude sees nothing of this conversation: the
   context (project, paths, what's decided), the user's request in their own words, what counts as
   done, for code "a branch and a PR, don't merge it yourself", "answer the user briefly, in
   <their language>".
2. **Start it.** argv runs without a shell and Herdr's PATH may be bare, so go through the user's
   shell, and keep a shell after Claude exits:
   `["/bin/zsh", "-ic", "claude \"$(cat <brief>)\"; exec zsh -i"]`
   In a git repo use `claude -w <name>` (its own worktree, so two sessions don't edit the same files).
   Plain `claude`, never by an absolute path.
3. **Mark it as your worker**, so Cmd+W on your tab offers to close it too:
   `hc label <terminal> propeller.parent=$(python3 ~/.claude/skills/herdr-tabs/here.py | python3 -c 'import json,sys; print(json.load(sys.stdin)["terminal"])')`
4. **Tell the user in one line** which tab you opened, in which space and what it does.
   It opens in the background; don't switch them to it unless they asked to go there.

## Watch it

`hc wait <terminal>` blocks until that Claude stops working; `hc read <terminal>` prints its
screen. Run the wait in the background and, when it returns, read the screen and come back with
the result and a next step (merge the PR, look at a diff). Never type into a tab that is still
working (`hc send` only once it waits for input, and only what the user asked for).

## Keep live setups out of it

A session started to test something works on copies only (its worktree, a temporary `HOME`), not
on symlinks in `~/.config`, the main clone's branch or live config files.
