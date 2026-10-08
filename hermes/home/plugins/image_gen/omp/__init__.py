"""Gemini image generation and editing through the local omp gateway."""
from agent.image_gen_provider import resolve_aspect_ratio, success_response
from agent.secret_scope import get_secret_str
from plugins.image_gen._common import (
    StaticImageGenProvider, collect_source_images, error_factory,
    materialize_image, record_token_usage,
)
from plugins.image_gen.openai import _named_bytes_io

MODEL = "google-antigravity/gemini-3.1-flash-image"
BASE_URL = "http://127.0.0.1:4000/v1"


class OmpImageProvider(StaticImageGenProvider):
    provider_id = "omp"
    label = "omp — Gemini Flash Image"
    default_model_id = MODEL
    models = {MODEL: {"display": "Gemini 3.1 Flash Image"}}

    def is_available(self):
        return bool(get_secret_str("OMP_GATEWAY_API_KEY"))

    def capabilities(self):
        return {"modalities": ["text", "image"], "max_reference_images": 3}

    def get_setup_schema(self):
        return {}

    def generate(self, prompt, aspect_ratio="landscape", *, image_url=None,
                 reference_image_urls=None, **kwargs):
        from openai import OpenAI

        aspect = resolve_aspect_ratio(aspect_ratio)
        fail = error_factory("omp", aspect, model=MODEL, prompt=prompt)
        sources = collect_source_images(image_url, reference_image_urls, limit=3)
        ratio = {"square": "1:1", "landscape": "16:9", "portrait": "9:16"}[aspect]
        # Gemini accepts resolution tiers, not OpenAI's pixel-size strings.
        request = dict(model=MODEL, prompt=prompt, n=1, size="1K",
                       extra_body={"aspect_ratio": ratio})
        files = []
        try:
            with OpenAI(base_url=BASE_URL, api_key=get_secret_str("OMP_GATEWAY_API_KEY"),
                        timeout=240, max_retries=0) as client:
                if sources:
                    files = [_named_bytes_io(ref) for ref in sources]
                    response = client.images.edit(image=files, **request)
                else:
                    response = client.images.generate(**request)
        except Exception as exc:
            return fail(str(exc), "api_error")
        finally:
            for file in files:
                file.close()
        record_token_usage(response.usage, model=MODEL, provider="omp", base_url=BASE_URL)
        if not response.data:
            return fail("The gateway returned no image", "empty_response")
        first = response.data[0]
        image, error = materialize_image(first.b64_json, first.url, prefix="omp_gemini",
                                        label=self.label, provider="omp", model=MODEL,
                                        prompt=prompt, aspect=aspect)
        if error:
            return error
        return success_response(image=image, model=MODEL, prompt=prompt,
                                aspect_ratio=aspect, provider="omp",
                                modality="image" if sources else "text")


def register(ctx):
    ctx.register_image_gen_provider(OmpImageProvider())
