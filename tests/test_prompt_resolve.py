"""Unit tests for prompt resolution used by ✨ upscale patch."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from prompt_resolve import (  # noqa: E402
    apply_resolved_to_args,
    list_lora_names,
    parse_generation_info,
    prepare_upscale_args,
    prompt_index_for_gallery,
    resolve_prompts_from_generation_info,
)


def _geninfo(**overrides):
    base = {
        "prompt": "template {character}",
        "all_prompts": [
            "Queen Opala, <lora:opala:0.8>, detailed",
            "Francine, <lora:francine:0.7>, pink",
        ],
        "negative_prompt": "neg-template",
        "all_negative_prompts": ["neg-A", "neg-B"],
        "seed": 111,
        "all_seeds": [111, 222],
        "subseed": 1,
        "all_subseeds": [1, 2],
        "index_of_first_image": 0,
        "infotexts": ["info0", "info1"],
    }
    base.update(overrides)
    return base


class ParseGenerationInfoTests(unittest.TestCase):
    def test_normal_dict(self):
        data = parse_generation_info(_geninfo())
        self.assertIsInstance(data, dict)
        self.assertEqual(len(data["all_prompts"]), 2)

    def test_normal_json_string(self):
        data = parse_generation_info(json.dumps(_geninfo()))
        self.assertEqual(data["all_seeds"], [111, 222])

    def test_empty_string(self):
        self.assertIsNone(parse_generation_info(""))
        self.assertIsNone(parse_generation_info("   "))

    def test_none(self):
        self.assertIsNone(parse_generation_info(None))

    def test_invalid_json(self):
        self.assertIsNone(parse_generation_info("{not-json"))


class IndexMappingTests(unittest.TestCase):
    def test_index_of_first_image_zero(self):
        self.assertEqual(prompt_index_for_gallery(0, 0), 0)
        self.assertEqual(prompt_index_for_gallery(1, 0), 1)

    def test_index_of_first_image_positive(self):
        # gallery[0]=grid, gallery[1]=first sample → k=0
        self.assertEqual(prompt_index_for_gallery(1, 1), 0)
        self.assertEqual(prompt_index_for_gallery(2, 1), 1)

    def test_index_out_of_range_negative_k(self):
        self.assertIsNone(prompt_index_for_gallery(0, 1))


class ResolveTests(unittest.TestCase):
    def test_resolve_first_image(self):
        r = resolve_prompts_from_generation_info(_geninfo(), 0)
        self.assertIsNotNone(r)
        assert r is not None
        self.assertEqual(r.prompt, "Queen Opala, <lora:opala:0.8>, detailed")
        self.assertEqual(r.negative_prompt, "neg-A")
        self.assertEqual(r.seed, 111)
        self.assertEqual(r.subseed, 1)
        self.assertEqual(r.prompt_index, 0)

    def test_resolve_second_image(self):
        r = resolve_prompts_from_generation_info(_geninfo(), 1)
        self.assertIsNotNone(r)
        assert r is not None
        self.assertIn("Francine", r.prompt)
        self.assertEqual(r.seed, 222)

    def test_resolve_with_grid_offset(self):
        info = _geninfo(index_of_first_image=1)
        self.assertIsNone(resolve_prompts_from_generation_info(info, 0))
        r = resolve_prompts_from_generation_info(info, 1)
        self.assertIsNotNone(r)
        assert r is not None
        self.assertEqual(r.prompt_index, 0)
        self.assertIn("Queen Opala", r.prompt)

    def test_index_beyond_all_prompts(self):
        self.assertIsNone(resolve_prompts_from_generation_info(_geninfo(), 99))

    def test_empty_generation_info(self):
        self.assertIsNone(resolve_prompts_from_generation_info("", 0))
        self.assertIsNone(resolve_prompts_from_generation_info({}, 0))


class ArgsSubstitutionTests(unittest.TestCase):
    def test_substitutes_prompt_and_negative_only(self):
        template = "__wildcard__"
        args = [template, "neg-field", "styles", 1, 1, 7.0, 512, 512]
        resolved = resolve_prompts_from_generation_info(_geninfo(), 0)
        assert resolved is not None
        out = apply_resolved_to_args(args, resolved)
        self.assertEqual(out[0], resolved.prompt)
        self.assertEqual(out[1], resolved.negative_prompt)
        self.assertEqual(out[2:], args[2:])
        # original list unchanged
        self.assertEqual(args[0], template)

    def test_prepare_upscale_args_table_scenario(self):
        """Step-2 style table: before fix args keep template; after fix match pass1."""
        template = "{character}, <lora:{lora}:0.8>"
        pass1 = "Queen Opala, <lora:opala:0.8>, detailed"
        info = _geninfo(all_prompts=[pass1, "Francine, <lora:francine:0.7>, pink"])
        args = [template, "neg", "styles"]

        # Before (stock): second pass would keep template in args[0]
        before_prompt = args[0]
        self.assertIn("{", before_prompt)

        after_args, resolved = prepare_upscale_args(info, 0, args)
        assert resolved is not None
        self.assertEqual(after_args[0], pass1)
        self.assertEqual(after_args[1], "neg-A")
        self.assertEqual(list_lora_names(after_args[0]), ["opala"])
        self.assertEqual(list_lora_names(pass1), list_lora_names(after_args[0]))
        # remaining args preserved
        self.assertEqual(after_args[2], "styles")

    def test_prepare_falls_back_when_empty(self):
        args = ["template", "neg"]
        out, resolved = prepare_upscale_args("", 0, args)
        self.assertIsNone(resolved)
        self.assertEqual(out, ["template", "neg"])


class LoraListTests(unittest.TestCase):
    def test_extracts_loras(self):
        self.assertEqual(
            list_lora_names("a <lora:opala:0.8> b <lora:francine:0.7>"),
            ["opala", "francine"],
        )


if __name__ == "__main__":
    unittest.main()
