# adetailer-hires-sync

A lightweight extension for **SD WebUI Forge / reForge** that automatically enables [ADetailer](https://github.com/Bing-su/adetailer) when you trigger a post-process hires fix on an already-generated image, then disables it once generation completes.

## Problem

Running ADetailer on every generation is expensive — it adds a full inpaint pass even when you don't need it. But clicking ✨ (hires fix post-process) without ADetailer means faces won't be corrected at the final resolution. Manually toggling the checkbox each time is friction.

## Solution

This extension hooks into the ✨ hires fix button and manages the ADetailer checkbox automatically:

1. You click ✨ on a finished image.
2. If ADetailer is **off** — the extension enables it and remembers it did so.
3. Generation runs (hires pass + ADetailer inpaint).
4. When generation completes — ADetailer is automatically turned back off (only if the extension enabled it for this run).
5. If ADetailer was already **on** when you clicked ✨ — it is left on and not touched on completion.

### Batch gallery: pick images for hires + ADetailer

After each batch, the script injects small circular checkboxes (**class `adhc-sel`**) on **txt2img** thumbnail buttons inside the gallery strip (not the main preview viewer):

- Thumbnails are resolved under `#txt2img_gallery`: container `.thumbnails` or `[class*='thumbnails']`, then `button` elements that contain an `<img>`.
- Buttons whose `id` or any ancestor `id` up to `#txt2img_gallery` contains `selected` or `preview` (case-insensitive) are skipped — avoids the large viewer slot.

**✨ behavior:**

- **No checkboxes ticked**, or **only one thumbnail** in the strip — same as above (single hires pass on whatever is currently selected).
- **One or more checkboxes ticked** and **two or more thumbnails** — builds a sorted queue of indices, then runs hires **sequentially**: select thumbnail → enable ADetailer if needed → ✨ → wait for completion → next item. Queue mode uses programmatic ✨ clicks guarded so the handler does not re-enter. After the queue finishes, injected checkboxes are removed and the selection list resets.

During active generation (`#txt2img_interrupt` visible), gallery `MutationObserver` updates do not touch the DOM (debounced reinjection otherwise).

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

Pure frontend — no Python backend. One JS file is loaded via the standard WebUI script mechanism (`javascript/adetailer_hires_sync.js`, ES5-compatible).

- **`#txt2img_upscale`** (✨): click handler enables ADetailer when unchecked (tracks `autoEnabledByScript`), arms completion observer, or starts multi-thumb queue processing when applicable.
- **`[id*="adetailer"] input[type="checkbox"]`**: ADetailer enable toggle (clicked only when the script decides to turn it on for hires).
- **`#txt2img_interrupt`**: `MutationObserver` on the `style` attribute — when `display` goes from visible generation state to `none` while `autoEnabledByScript` is true, completion runs (toggle ADetailer off, disconnect observer; if a queue is active, schedule the next item after a short delay).
- **`#txt2img_gallery`**: `MutationObserver` (debounced) reinjects thumbnail checkboxes after gallery DOM updates; injects one-off `#adhc-sel-styles` into `document.head` for checkbox appearance.

## Troubleshooting

If the extension does not trigger, verify selectors in DevTools (`F12 -> Console`):

```javascript
// ADetailer checkbox
gradioApp().querySelector('[id*="adetailer"] input[type="checkbox"]')

// Hires fix button
gradioApp().querySelector('#txt2img_upscale')

// Interrupt button (used for completion detection)
gradioApp().querySelector('#txt2img_interrupt')

// Gallery root (thumbnails + preview live here)
gradioApp().querySelector('#txt2img_gallery')
```

All must return an element where relevant, not `null`. If any returns `null`, update the selectors in `javascript/adetailer_hires_sync.js` to match your build.

## License

MIT
