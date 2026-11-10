---
name: herdr-tabs
description: Inside the Herdr app (`herdr-app status` answers), open a new tab or space with its own Claude for a separate task instead of doing it in this conversation. Use when the user asks to open a tab or space for something ("відкрий таб для…", "open a tab where we'll work on…"), or asks for something that clearly drifts from this tab's topic and would make a session of its own (another project, a separate feature or bug, a long job); then watch it and come back with its result. Not for small, quick things or for continuing the current topic.
---

# A separate task → a new Herdr tab or space

Only inside Herdr: `herdr-app status` prints JSON (with `"space"`, the space in front). If it
fails, Herdr isn't running here: work as usual. Never start Herdr or the `hc` server yourself
(`open`, `hc server start`, `hc machine add`): a core started from a Claude session inherits its
environment, and Claude in Herdr stops saving conversations.

## Where

- **A new space** when it's another project or a big job of its own (a launch, a product): it gets
  its own row in the sidebar. `herdr-app do space.new '{"name": "...", "folder": "...", "argv": [...]}'`
- **A new tab in this space** for a side task of the same project:
  `herdr-app do tab.new '{"space": "<id>", "name": "...", "folder": "...", "argv": [...]}'`
  (`<id>`: `"space"` from `herdr-app status`).

Both print JSON with `terminal` (e.g. `t42`); keep it. The folder is the project's (look it up in
the vault's MAP.md → «Код», or `~/code/<name>`).

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
3. **Tell the user in one line** what you opened (space or tab, its name) and what it does.
   It opens in the background; don't switch them to it unless they asked to go there.

## Watch it

`hc wait <terminal>` blocks until that Claude stops working; `hc read <terminal>` prints its
screen. Run the wait in the background and, when it returns, read the screen and come back with
the result and a next step (merge the PR, look at a diff). Never type into a tab that is still
working (`hc send` only once it waits for input, and only what the user asked for).

## Keep live setups out of it

A session started to test something works on copies only (its worktree, a temporary `HOME`), not
on symlinks in `~/.config`, the main clone's branch or live config files.
