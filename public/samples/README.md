# Sample images — /check/face

`FaceCheckPanel` shows sample tiles so people can try the detector before
uploading their own photo. It only renders a tile for a sample file that
actually exists in this folder — a missing file just means one fewer tile,
never a broken image or a fake result.

## What's here

- **`landscape-no-face.jpg`** — a synthetically generated (Pillow/PIL) sky +
  hills scene. No real photo, no people, a genuine negative case for "No face
  detected."

## What's deliberately NOT here

**"One face" and "two faces" sample photos are not bundled.** The only source
readily available while building this was `@vladmandic/face-api`'s own demo
folder, which contains real, identifiable strangers. Shipping recognizable
people's photos as default content in a *face-privacy* tool is exactly the
kind of thing this tool exists to help people avoid doing — so it's left out
rather than shipped as a placeholder.

## Adding real face samples yourself

Drop your own two files here and they'll appear automatically, no code
changes needed:

- `one-face.jpg` — a single face, clearly visible
- `two-faces.jpg` — two faces, clearly visible

Use photos you have the rights to use (your own, a colleague's with
permission, or a CC0/public-domain portrait set). `FaceCheckPanel` checks for
these exact filenames under `/samples/` and only shows a tile when the file
loads successfully.
