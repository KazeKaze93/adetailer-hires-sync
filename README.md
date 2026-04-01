# adetailer-hires-sync

A lightweight extension for **SD WebUI Forge / reForge** that automatically enables [ADetailer](https://github.com/Bing-su/adetailer) when you trigger a post-process hires fix on an already-generated image, then disables it once generation completes.

## Problem

Running ADetailer on every generation is expensive — it adds a full inpaint pass even when you don't need it. But clicking ✨ (hires fix post-process) without ADetailer means faces won't be corrected at the final resolution. Manually toggling the checkbox each time is friction.

## Solution

This extension hooks into the ✨ hires fix button and manages the ADetailer checkbox automatically:

1. You click ✨ on a finished image.
2. If ADetailer is **off** — the extension enables it and remembers it did so.
3. Generation runs (hires pass + ADetailer inpaint).
4. When generation completes — ADetailer is automatically turned back off.
5. If ADetailer was already **on** when you clicked ✨ — it is left on and not touched on completion.

## Installation

**Via URL:**
1. Open **Extensions -> Install from URL**
2. Paste: `https://github.com/KazeKaze93/adetailer-hires-sync.git`
3. Click **Install**, then **Apply and restart UI**

**Manual:**
Clone or download this repo into your `extensions/` folder, then restart the WebUI.

## Requirements

- SD WebUI Forge or reForge (tested on reForge by Panchovix)
- [ADetailer](https://github.com/Bing-su/adetailer) extension installed and configured

## How it works

Pure frontend — no Python backend. A single JS file is injected via the standard WebUI script loading mechanism.

- Watches `#txt2img_upscale` (the ✨ button) for click events
- Toggles `[id*="adetailer"] input[type="checkbox"]` (ADetailer enable toggle)
- Uses `MutationObserver` on `#txt2img_interrupt` style attribute to detect generation start/end
- Observer is created fresh on each ✨ click and disconnects after completion

## Troubleshooting

If the extension does not trigger, verify selectors in DevTools (`F12 -> Console`):

```javascript
// ADetailer checkbox
gradioApp().querySelector('[id*="adetailer"] input[type="checkbox"]')

// Hires fix button
gradioApp().querySelector('#txt2img_upscale')

// Interrupt button (used for completion detection)
gradioApp().querySelector('#txt2img_interrupt')
```

All three must return an element, not `null`. If any returns `null`, the selectors in `javascript/adetailer_hires_sync.js` need to be updated to match your build.

## License

MIT
