# KIE.ai API — the parts the CLI uses

Base URL: `https://api.kie.ai/api/v1` · Auth: `Authorization: Bearer <key>` · All calls JSON.
KIE signals application errors with **HTTP 200 + `code !== 200`**; the CLI treats both as errors.

## Market API (most models)

```http
POST /jobs/createTask
{ "model": "<model-id>", "input": { ...model-specific... } }
→ { "code": 200, "msg": "success", "data": { "taskId": "task_…" } }

GET /jobs/recordInfo?taskId=task_…
→ { "code": 200, "data": {
      "taskId", "model",
      "state": "waiting" | "queuing" | "generating" | "success" | "fail",
      "resultJson": "{\"resultUrls\":[\"https://…\"]}",     // string, parse it
      "failCode", "failMsg", "progress", "creditsConsumed",
      "createTime", "completeTime", "costTime" } }
```

- `callBackUrl` is optional on createTask — **the CLI never sends it**.
- Result URLs expire after ~24 h → always download.
- Failed tasks are not charged (per KIE docs).

## Veo 3 (own endpoints)

```http
POST /veo/generate
{ "prompt", "imageUrls"?: [start, end?], "model": "veo3" | "veo3_fast",
  "aspectRatio": "16:9" | "9:16" | "Auto", "enableTranslation": true }
→ data.taskId

GET /veo/record-info?taskId=…
→ data.successFlag: 0 running · 1 success · 2/3 failed
  data.response.resultUrls[]  ·  data.errorMessage
GET /veo/get-1080p-video?taskId=…   (16:9 only; not used by the CLI yet)
```

## Credits

```http
GET /chat/credit → { "code": 200, "data": 1234 }   // remaining credits (1 credit = US$0.005 list price)
```

## File upload (KIE's official host)

```http
POST https://kieai.redpandaai.co/api/file-stream-upload   (multipart: file, uploadPath, fileName?)
→ { "code": 200, "data": { "fileUrl": "https://…" } }    // auto-deleted after ~3 days
```

## Model input shapes in the catalog

| model id | key fields |
|---|---|
| `nano-banana-2` | `prompt`, `image_input[]` (≤14), `aspect_ratio`, `resolution` 1K/2K/4K, `output_format` png/jpg, `google_search` |
| `bytedance/seedream-v4-text-to-image` | `prompt`, `image_size` (square_hd, landscape_16_9, portrait_4_3, …), `image_resolution` 1K/2K/4K, `max_images` 1–6, `seed` |
| `bytedance/seedream-v4-edit` | same + `image_urls[]` |
| `kling-3.0/video` | `prompt`, `image_urls[]` (start[, end]), `duration` "3".."15" (string), `aspect_ratio` 16:9/9:16/1:1, `mode` std/pro, `sound`, `multi_shots`, `multi_prompt[]`, `kling_elements[]` |
| `bytedance/seedance-2-5` | `prompt`, `first_frame_url`, `last_frame_url`, `reference_image_urls[]`, `reference_video_urls[]`, `reference_audio_urls[]`, `generate_audio`, `resolution` 480p/720p/1080p, `aspect_ratio`, `duration` 4–30 (int), `output_format` mp4/mov |
| `minimax-h3/text-to-video` | `prompt`, `duration` 4–15, `aspect_ratio`, `resolution` 768P/2K |
| `minimax-h3/image-to-video` | `prompt`, `first_frame_url`, `last_frame_url`?, `duration`, `resolution` |
| `minimax-h3/reference-to-video` | `prompt`, `reference_image_urls[]` (1–9) *or* `reference_video_urls[]`, `reference_audio_urls[]`, `duration`, `aspect_ratio` (incl. adaptive), `resolution` |
| `grok-imagine-image-2-0/text-to-image` | `prompt`, `aspect_ratio` 1:1/2:3/3:2/16:9/9:16 (both required) |
| `grok-imagine-image-2-0/image-edit` | `prompt`, `aspect_ratio` (+ `auto`), `image_urls[]` ≤5 |
| `grok-imagine-image-2-0/segment-map` + `/segment-edit` | mask workflow: map first, then `task_id` + `mask_indexs[]` — `kie run` only |
| `kling-3.0-omni/text-to-video` | `prompt`, `duration` 3–15 (int), `resolution` 720p/1080p/4k, `aspect_ratio` 16:9/9:16/1:1, `audio`, `customize_multi_shots`, `prefer_multi_shots`, `multi_prompt[]`, `elements[]` |
| `kling-3.0-omni/image-to-video` | same + `image_urls[]` — exactly 1 (first frame) or exactly 2 (first + last) |
| `kling-3.0-omni/reference-to-video` | same + `image_urls[]` ≤7 (subject refs) *or* `video_urls[]` (exactly 1, 3–15.5 s) |
| `wan/3-0-video`, `wan/3-0-video-prime` | `prompt`, `first_frame_url`, `last_frame_url`, `reference_image_urls[]` ≤10, `reference_video_urls[]` ≤5, `reference_audio_urls[]` ≤5, `reference_file_urls[]` ≤1, `reference_link_urls[]` ≤1, `resolution` 480P/720P/1080P, `aspect_ratio` (adaptive default), `duration` 2–30 or -1, `audio`, `seed` |
| `google/gemini-omni-flash-1-1` | `prompt`, `duration` "4"/"6"/"8"/"10" (string, required), `image_urls[]` ≤7, `first_frame_url` + `last_frame_url`, `audio_ids[]`, `video_list[{url,start,ends}]`, `character_ids[]`, `aspect_ratio` 16:9/9:16, `resolution` 360p/720p/1080p/4k, `seed` |

`google/gemini-omni-flash-1-1` quota: images×1 + videos×2 + character_ids×1 ≤ 7, and `first_frame_url`
excludes `image_urls`, `audio_ids`, `video_list` and `character_ids`.

## Credit prices (KIE list, Aug 30 2026 · 1 credit = US$0.005)

| model | price |
|---|---|
| `nano-banana-2` | 8 / 12 / 18 (1K / 2K / 4K) |
| `grok-imagine-image-2-0/*` | 4 per image; segment map free |
| `minimax-h3/*` | 8 credits/s at 768P, 13 at 2K; +4 per reference image past the first 5; input audio free |
| `bytedance/seedance-2-5` | per second — no video input 28 / 63 / 114, with video input 17 / 38 / 68.5 (480p / 720p / 1080p); 1080p reflects a 28% promo until 2026-09-17 |
| `kling-3.0-omni/*` | per second — 720p 14 mute / 18 audio / 20 video-in; 1080p 18 / 23 / 27; 4k 67 flat |
| `wan/3-0-video`, `wan/3-0-video-prime` | per second — 8 / 16 / 32 (480P / 720P / 1080P) |
| `google/gemini-omni-flash-1-1` | flat — ≤1080p 63 / 84 / 105 / 126 and 4k 147 / 168 / 189 / 210 for 4 / 6 / 8 / 10 s; with video input 168 (252 at 4k) |
| `kling-3.0/video`, `bytedance/seedream-v4-*`, `veo3` | not published per-model — pass `--max-credits` |

Per-model docs: `https://docs.kie.ai/market/<vendor>/<model>` — check before using `--set` or `kie run`.
