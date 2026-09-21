"""Patch txt2img ✨ upscale to reuse the selected image's expanded prompts.

Hooks modules.txt2img.txt2img_upscale_function so Gradio's already-bound
wrapper still picks up the fix (it calls the function by name at runtime).
"""
from __future__ import annotations

import json
import logging
import sys
from contextlib import closing
from pathlib import Path

from modules import script_callbacks
from modules.infotext_utils import image_from_url_text, parse_generation_parameters
from modules.ui import plaintext_to_html
from PIL import Image

_EXT_ROOT = Path(__file__).resolve().parent.parent
if str(_EXT_ROOT) not in sys.path:
    sys.path.insert(0, str(_EXT_ROOT))

from prompt_resolve import prepare_upscale_args  # noqa: E402

logger = logging.getLogger(__name__)

_PATCHED = False
_ORIG = None


def _run_upscale_with_resolved(
    id_task,
    request,
    gallery,
    gallery_index,
    generation_info,
    args,
    resolved,
):
    """Same control flow as modules.txt2img.txt2img_upscale_function, with fixed prompts/seeds."""
    import modules.processing as processing
    import modules.scripts
    import modules.shared as shared
    import modules.txt2img as txt2img

    assert len(gallery) > 0, "No image to upscale"
    assert 0 <= gallery_index < len(gallery), f"Bad image index: {gallery_index}"

    p = txt2img.txt2img_create_processing(id_task, request, *args, force_enable_hr=True)
    p.batch_size = 1
    p.n_iter = 1
    p.txt2img_upscale = True

    geninfo = json.loads(generation_info) if isinstance(generation_info, str) else dict(generation_info)

    image_info = gallery[gallery_index] if 0 <= gallery_index < len(gallery) else gallery[0]
    p.firstpass_image = image_from_url_text(image_info)

    if resolved is not None:
        p.seed = resolved.seed
        p.subseed = resolved.subseed
        # Keep p.prompt / all_prompts aligned for ADetailer blank ad_prompt inheritance.
        p.prompt = resolved.prompt
        p.negative_prompt = resolved.negative_prompt
    else:
        parameters = parse_generation_parameters(geninfo.get("infotexts")[gallery_index], [])
        p.seed = parameters.get("Seed", -1)
        p.subseed = parameters.get("Variation seed", -1)

    p.override_settings["save_images_before_highres_fix"] = False

    with closing(p):
        processed = modules.scripts.scripts_txt2img.run(p, *p.script_args)
        if processed is None:
            processed = processing.process_images(p)

    shared.total_tqdm.clear()

    new_gallery = []
    for i, image in enumerate(gallery):
        if i == gallery_index:
            if shared.opts.hires_button_gallery_inset:
                fake_image = Image.new(mode="RGB", size=(1, 1))
                fake_image.already_saved_as = image["name"].rsplit("?", 1)[0]
                new_gallery.append(fake_image)
                geninfo["infotexts"][gallery_index + 1 : gallery_index + 1] = processed.infotexts
            else:
                geninfo["infotexts"][gallery_index : gallery_index + 1] = processed.infotexts
            new_gallery.extend(processed.images)
        else:
            fake_image = Image.new(mode="RGB", size=(1, 1))
            fake_image.already_saved_as = image["name"].rsplit("?", 1)[0]
            new_gallery.append(fake_image)

    return (
        new_gallery,
        json.dumps(geninfo),
        plaintext_to_html(processed.info),
        plaintext_to_html(processed.comments, classname="comments"),
    )


def _patched_txt2img_upscale_function(id_task, request, gallery, gallery_index, generation_info, *args):
    new_args, resolved = prepare_upscale_args(generation_info, gallery_index, args)
    if resolved is None:
        logger.warning(
            "[adetailer-hires-sync] generation_info missing/empty or gallery index "
            "out of range (gallery_index=%r); using stock txt2img_upscale behaviour "
            "(prompt field may still contain wildcards).",
            gallery_index,
        )
        return _ORIG(id_task, request, gallery, gallery_index, generation_info, *args)

    logger.info(
        "[adetailer-hires-sync] ✨ using expanded prompt from generation_info "
        "all_prompts[%d] (len=%d); seed=%s subseed=%s",
        resolved.prompt_index,
        len(resolved.prompt),
        resolved.seed,
        resolved.subseed,
    )
    return _run_upscale_with_resolved(
        id_task, request, gallery, gallery_index, generation_info, new_args, resolved
    )


def apply_patch() -> bool:
    global _PATCHED, _ORIG
    if _PATCHED:
        return True
    try:
        import modules.txt2img as txt2img
    except Exception:
        logger.exception("[adetailer-hires-sync] cannot import modules.txt2img")
        return False

    _ORIG = txt2img.txt2img_upscale_function
    txt2img.txt2img_upscale_function = _patched_txt2img_upscale_function
    _PATCHED = True
    logger.info("[adetailer-hires-sync] patched txt2img_upscale_function for expanded prompts")
    return True


def on_app_started(demo, app):
    apply_patch()


# Patch as early as possible (script import) and again after UI start.
apply_patch()
script_callbacks.on_app_started(on_app_started)
