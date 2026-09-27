# Face detection model weights

These weights power `src/lib/face-detector.ts` (client-side, in-browser only).

| File | Purpose |
|---|---|
| `tiny_face_detector_model-weights_manifest.json` + `.bin` | Face bounding-box detection (fast, single-shard SSD-style model, ~193KB) |
| `face_landmark_68_model-weights_manifest.json` + `.bin` | 68-point facial landmarks, used only to size/orient the redaction region — not exposed as a separate "landmarks" feature |

## Where these came from

Extracted directly from the `@vladmandic/face-api` npm package (v1.7.15),
which bundles its own model weights under `model/` in the published package —
no external CDN or separate download step required.

```
npm view @vladmandic/face-api dist.tarball
# https://registry.npmjs.org/@vladmandic/face-api/-/face-api-1.7.15.tgz
```

The tarball also contains `age_gender_model`, `face_expression_model`,
`face_recognition_model`, and `ssd_mobilenetv1_model` — **none of those are
included here**, on purpose. FixMP's Face Privacy check does detection and
region-blurring only: no age/gender inference, no expression/emotion
labelling, no face recognition/identity matching. Only the two models above
are loaded.

## Keeping these in sync

If `@vladmandic/face-api` is upgraded in `package.json`, re-extract these two
files from the matching version's tarball so the manifest's quantization
metadata always matches the `.bin` file it describes:

```bash
npm pack @vladmandic/face-api
tar xzf vladmandic-face-api-*.tgz package/model/tiny_face_detector_model.bin \
  package/model/tiny_face_detector_model-weights_manifest.json \
  package/model/face_landmark_68_model.bin \
  package/model/face_landmark_68_model-weights_manifest.json
# copy the 4 extracted files here, overwriting the old ones
```

## Loading

`src/lib/face-detector.ts` loads from `/models/face-api/` (this folder, as a
public static path) via `faceapi.nets.tinyFaceDetector.loadFromUri(...)` and
`faceapi.nets.faceLandmark68Net.loadFromUri(...)`, lazily on first use, cached
after that. A failed fetch or a failed model load is surfaced to the engine as
`status: "error"` — it is never reported as "no faces found."
