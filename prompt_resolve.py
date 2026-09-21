"""Resolve expanded prompts for txt2img ✨ (hires upscale) from generation_info.

When the prompt field still contains wildcards, the second pass would re-expand
them. This module substitutes all_prompts[k] / all_negative_prompts[k] (and
seeds) from the selected gallery image before the core upscale handler runs.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

LORA_RE = re.compile(r"<lora:([^:>]+)(?::([^>]*))?>", re.IGNORECASE)


@dataclass(frozen=True)
class ResolvedPrompts:
    prompt: str
    negative_prompt: str
    seed: int
    subseed: int
    prompt_index: int


def parse_generation_info(generation_info: Any) -> dict[str, Any] | None:
    """Parse generation_info JSON (str or dict). Empty / invalid → None."""
    if generation_info is None:
        return None
    if isinstance(generation_info, dict):
        data = generation_info
    elif isinstance(generation_info, str):
        text = generation_info.strip()
        if not text:
            return None
        try:
            data = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return None
    else:
        return None
    if not isinstance(data, dict) or not data:
        return None
    return data


def prompt_index_for_gallery(gallery_index: int, index_of_first_image: int) -> int | None:
    """Map gallery slot → all_prompts index. None if out of range / invalid."""
    try:
        gi = int(gallery_index)
        first = int(index_of_first_image)
    except (TypeError, ValueError):
        return None
    k = gi - first
    if k < 0:
        return None
    return k


def resolve_prompts_from_generation_info(
    generation_info: Any,
    gallery_index: int,
) -> ResolvedPrompts | None:
    """
    Return expanded prompt/neg/seed for the selected gallery image, or None
    when generation_info is missing/empty or the index is out of range.
    """
    data = parse_generation_info(generation_info)
    if data is None:
        return None

    first = data.get("index_of_first_image", 0)
    try:
        first_i = int(first) if first is not None else 0
    except (TypeError, ValueError):
        first_i = 0

    k = prompt_index_for_gallery(gallery_index, first_i)
    if k is None:
        return None

    all_prompts = data.get("all_prompts") or []
    all_negatives = data.get("all_negative_prompts") or []
    all_seeds = data.get("all_seeds") or []
    all_subseeds = data.get("all_subseeds") or []

    if not isinstance(all_prompts, list) or k >= len(all_prompts):
        return None

    prompt = all_prompts[k]
    if not isinstance(prompt, str):
        return None

    if isinstance(all_negatives, list) and k < len(all_negatives) and isinstance(all_negatives[k], str):
        negative = all_negatives[k]
    else:
        neg0 = data.get("negative_prompt", "")
        negative = neg0 if isinstance(neg0, str) else ""

    seed = -1
    if isinstance(all_seeds, list) and k < len(all_seeds):
        try:
            seed = int(all_seeds[k])
        except (TypeError, ValueError):
            seed = -1
    elif data.get("seed") is not None:
        try:
            seed = int(data["seed"])
        except (TypeError, ValueError):
            seed = -1

    subseed = -1
    if isinstance(all_subseeds, list) and k < len(all_subseeds):
        try:
            subseed = int(all_subseeds[k])
        except (TypeError, ValueError):
            subseed = -1
    elif data.get("subseed") is not None:
        try:
            subseed = int(data["subseed"])
        except (TypeError, ValueError):
            subseed = -1

    return ResolvedPrompts(
        prompt=prompt,
        negative_prompt=negative,
        seed=seed,
        subseed=subseed,
        prompt_index=k,
    )


def apply_resolved_to_args(
    args: tuple[Any, ...] | list[Any],
    resolved: ResolvedPrompts,
) -> list[Any]:
    """
    Substitute prompt / negative_prompt in txt2img *args (positions 0 and 1).
    Other arguments are preserved unchanged.
    """
    out = list(args)
    if len(out) < 2:
        raise ValueError(f"txt2img upscale args too short for prompt/neg: len={len(out)}")
    out[0] = resolved.prompt
    out[1] = resolved.negative_prompt
    return out


def list_lora_names(prompt: str) -> list[str]:
    """Ordered unique LoRA names referenced in a prompt string."""
    seen: set[str] = set()
    names: list[str] = []
    for match in LORA_RE.finditer(prompt or ""):
        name = match.group(1).strip()
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    return names


def prepare_upscale_args(
    generation_info: Any,
    gallery_index: int,
    args: tuple[Any, ...] | list[Any],
) -> tuple[list[Any], ResolvedPrompts | None]:
    """
    If generation_info yields a resolved prompt for gallery_index, return
    substituted args + ResolvedPrompts. Otherwise return original args + None
    (caller should keep stock behaviour and may log a warning).
    """
    resolved = resolve_prompts_from_generation_info(generation_info, gallery_index)
    if resolved is None:
        return list(args), None
    return apply_resolved_to_args(args, resolved), resolved
