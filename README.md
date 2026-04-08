# pi-edit-last

Edit assistant replies since the last user message in your external editor (Zed, VS Code, etc.).

## Install

```bash
pi install git:github.com:wasname/pi-edit-last
```

Then `/reload` in pi.

## Usage

1. Have a conversation with pi
2. Run `/edit-last-external`
3. Your `$EDITOR` (Zed) opens with quoted assistant text — edit it
4. Save and close
5. Pi receives your edited version as a revision request

## Editor

Uses `$VISUAL` or `$EDITOR` (falls back to `vi`). Set in your shell:
```bash
export VISUAL=zed  # or code, vim, etc.
```

## Related

- [pi-studio](https://github.com/omaclaren/pi-studio) — Collection of pi extensions
