# adetailer-hires-sync

SD WebUI Forge/reForge extension that syncs ADetailer with the `hires fix` post-process action in `txt2img`.

## What it does

- Detects click on the `hires fix` button in the `txt2img` image viewer toolbar.
- If ADetailer is disabled, enables it automatically and remembers that it was enabled by this extension.
- Watches the `txt2img` Generate button state (`Generate -> Interrupt/Skip -> Generate`) using `MutationObserver`.
- When generation is complete and ADetailer was auto-enabled by this extension, disables ADetailer again.

## File structure

- `javascript/adetailer_hires_sync.js` - frontend injection logic (no Python backend required).

## Important selector check

This extension relies on DOM selectors that may differ between Forge/reForge builds.  
Verify these in DevTools if behavior does not trigger:

- Hires button selector (title contains `hires fix`)
- ADetailer enable checkbox selector (top toggle in ADetailer accordion)
- `txt2img` Generate button selector

Current defaults are documented at the top of `javascript/adetailer_hires_sync.js`.

## Notes

- The extension only turns ADetailer off if it turned it on itself.
- If ADetailer was already enabled by the user, it stays enabled.
- Observer disconnects after completion and is re-armed only on the next `hires fix` click.
