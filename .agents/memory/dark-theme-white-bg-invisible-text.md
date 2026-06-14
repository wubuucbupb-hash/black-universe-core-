---
name: Dark theme + bg-white = invisible text
description: asset-verify is a dark theme; light/white backgrounds without explicit dark text render invisible text.
---

# bg-white on a dark theme hides text

asset-verify's theme is dark: `--foreground` is light (~92% L) and `--background` is near-black. Default text (FormLabel, inherited `text-card-foreground`, native `<select>`/`<option>`) is therefore light.

Putting content on a `bg-white` container (plain `<div className="bg-white ...">`, a native `<select className="bg-white">`, etc.) leaves the text light-on-white → effectively invisible.

**Why:** the app mixes hand-written light cards with shadcn components that read dark theme tokens; the two clash silently (no error, just unreadable).

**How to apply:** for any user-facing surface, prefer the dark tokens — `bg-card text-card-foreground border-card-border` for cards, and dark `<select>` styling (`bg-zinc-900 text-zinc-100 border-zinc-700`). Never ship `bg-white` without also forcing a dark text color. This already bit the dashboard currency selectors and the submit / universe-control-space asset-declaration cards.
