"""Simulate ✨ upscale prompt source: stock (field template) vs patched (generation_info).

Does not require a running WebUI. Prints the step-2 comparison table for a
wildcard-like template that expands differently on each call.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from prompt_resolve import list_lora_names, prepare_upscale_args


def main() -> int:
    template = "{character}, <lora:{lora}:0.8>, detailed"
    pass1_prompt = "Queen Opala, <lora:opala:0.8>, detailed"
    pass1_neg = "lowres"
    # Second independent expand (what the field would yield on a fresh resolve)
    pass2_field_expand = "Francine, <lora:francine:0.7>, pink"

    generation_info = {
        "all_prompts": [pass1_prompt],
        "all_negative_prompts": [pass1_neg],
        "all_seeds": [42],
        "all_subseeds": [0],
        "index_of_first_image": 0,
        "infotexts": [f"Prompt: {pass1_prompt}\nNegative prompt: {pass1_neg}\nSeed: 42"],
    }

    args = [template, "neg-field", "styles"]

    print("=== BEFORE fix (stock txt2img_upscale uses field args) ===")
    stock_prompt = args[0]  # still the template / would re-expand to Francine
    print(
        f"| pass | source | prompt | LoRAs |\n"
        f"|---|---|---|---|\n"
        f"| 1 | all_prompts[0] | {pass1_prompt} | {list_lora_names(pass1_prompt)} |\n"
        f"| 2 (stock) | UI field re-expand | {pass2_field_expand} | {list_lora_names(pass2_field_expand)} |\n"
        f"| PNG (stock) | same as pass 2 | {pass2_field_expand} | {list_lora_names(pass2_field_expand)} |"
    )
    print(f"mismatch: {pass1_prompt != pass2_field_expand}")

    print("\n=== AFTER fix (prepare_upscale_args) ===")
    new_args, resolved = prepare_upscale_args(json.dumps(generation_info), 0, args)
    assert resolved is not None
    p2 = new_args[0]
    print(
        f"| pass | source | prompt | LoRAs |\n"
        f"|---|---|---|---|\n"
        f"| 1 | all_prompts[0] | {pass1_prompt} | {list_lora_names(pass1_prompt)} |\n"
        f"| 2 (patched) | all_prompts[k] via args[0] | {p2} | {list_lora_names(p2)} |\n"
        f"| PNG (patched) | same as pass 2 | {p2} | {list_lora_names(p2)} |"
    )
    ok = (
        p2 == pass1_prompt
        and new_args[1] == pass1_neg
        and list_lora_names(p2) == list_lora_names(pass1_prompt)
        and resolved.seed == 42
    )
    print(f"match: {ok}")
    print(f"field template left unchanged in caller list: {args[0] == template}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
