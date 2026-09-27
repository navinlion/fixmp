#!/usr/bin/env bash
# FixMP Face & Biometric Privacy Addon — fetch local model weights (spec §24).
#
# Downloads the @vladmandic/face-api model files into the host project's
# `public/models/face-api/` so the detector loads FixMP-controlled LOCAL
# weights instead of a permanent external CDN. The user's photograph is never
# uploaded merely because the detector initialises — only these public model
# weights are fetched, once.
#
# Usage (run from your FixMP project root, AFTER integrating the addon):
#   bash scripts/fetch-models.sh
# or:  chmod +x scripts/fetch-models.sh && ./scripts/fetch-models.sh
#
# Requires: curl, unzip (or a tar that handles .gz). No node/bun needed.

set -euo pipefail

DEST="${1:-public/models/face-api}"
SRC="https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model"

mkdir -p "$DEST"
cd "$DEST"

echo "→ Fetching FixMP face-api model weights into: $(pwd)"
echo "  (these are PUBLIC model weights, not user data)"

# TinyFaceDetector — fast face bounding-box + score model.
for f in tiny_face_detector_model-weights_manifest.json tiny_face_detector_model-shard1; do
  curl -fsSL -o "$f" "$SRC/$f"
  echo "  ✓ $f"
done

# faceLandmark68Net — the 68 iBUG landmarks (eyes, mouth, head orientation).
for f in face_landmark_68_model-weights_manifest.json face_landmark_68_model-shard1; do
  curl -fsSL -o "$f" "$SRC/$f"
  echo "  ✓ $f"
done

echo ""
echo "✓ Done. The addon now loads from '/models/face-api/' (local) by default."
echo "  Verify with the devtools Network panel: the only external requests"
echo "  during detection should be to these local files (no user-image upload)."
