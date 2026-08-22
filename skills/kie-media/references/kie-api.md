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
| `minimax-h3/text-to-video` | `prompt`, `duration` 4–15, `aspect_ratio` |
| `minimax-h3/image-to-video` | `prompt`, `first_frame_url`, `last_frame_url`?, `duration` |
| `minimax-h3/reference-to-video` | `prompt`, `reference_image_urls[]` (1–9), `duration`, `aspect_ratio` (incl. adaptive) |

Per-model docs: `https://docs.kie.ai/market/<vendor>/<model>` — check before using `--set` or `kie run`.
