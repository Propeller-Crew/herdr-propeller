# herdr-propeller

Our additions to the Herdr app (herdr.dev), kept outside Herdr so its updates keep coming.

- `mods/propeller/`: the "Propeller" mod. Brings Claude back after a reboot (`claude --resume`),
  puts spaces to sleep after a day without activity (tabs settled, space sinks to the bottom),
  sorts spaces by attention (needs you > done > working > idle > sleeping), and shows
  Claude's 5 h and weekly limits from `~/.claude/rate-limits.json`.
  Linked into the app: `ln -sfn ~/code/herdr-propeller/mods/propeller ~/.config/herdr-app/mods/propeller`.
  State: `~/.config/herdr-app/data/propeller-state.json`.
- `layout-propeller.json`: a copy of our layout (Herdr's `main` cloned, plus the Propeller block
  above the sidebar footer). The live file is `~/.config/herdr-app/layouts/propeller.json`.
  A layout clone doesn't get Herdr's layout updates; the shipped mods it uses still do.
- `config.toml`, `limits.py`: for the terminal version of herdr (TUI), unused by the app.

Never start Herdr.app or `hc` from inside a Claude session: the core inherits
`CLAUDE_CODE_CHILD_SESSION` and Claude stops saving conversations. Start the app from Spotlight.
