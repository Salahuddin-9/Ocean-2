#!/usr/bin/env python3
"""
Turtle NSFW Server Engine — OpenNSFW (Yahoo) Python 3 classifier.

A Python 3 compatible wrapper around the Yahoo open_nsfw Caffe model
(deploy.prototxt + resnet_50_1by2_nsfw.caffemodel). The server route
(/api/nsfw/check) invokes this script with a base64 image on stdin and
reads a single JSON line back.

Output contract:
  {"engine": "open_nsfw", "score": 0.14}                -> success
  {"engine": "unavailable", "reason": "..."}            -> caffe missing / error (caller falls back)

NOTE: Caffe (pycaffe) is required. If it is not installed this script prints
"unavailable" so the Node.js fallback engine (NSFWJS) can take over.
"""
import base64
import io
import json
import os
import sys

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DEF = os.path.join(MODEL_DIR, "deploy.prototxt")
MODEL_WEIGHTS = os.path.join(MODEL_DIR, "resnet_50_1by2_nsfw.caffemodel")

# Hard-coded preprocess parameters for best results (matches original repo)
MEAN = [104, 117, 123]
INPUT_SIZE = 256
CROP_SIZE = 224


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def resize_image(data, sz=(INPUT_SIZE, INPUT_SIZE)):
    """Resize image using PIL; this mirrors the training-time resize logic."""
    try:
        from PIL import Image
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Pillow (PIL) is required: %s" % exc)

    im = Image.open(io.BytesIO(data))
    if im.mode != "RGB":
        im = im.convert("RGB")
    imr = im.resize(sz, resample=Image.BILINEAR)
    fh = io.BytesIO()
    imr.save(fh, format="JPEG")
    fh.seek(0)
    return fh.read()


def main():
    raw = sys.stdin.read().strip()
    if not raw:
        emit({"engine": "unavailable", "reason": "no image data received"})
        return 1

    # Accept optional data-url prefix (data:image/jpeg;base64,...)
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(raw)
    except Exception as exc:
        emit({"engine": "unavailable", "reason": "invalid base64 input: %s" % exc})
        return 1

    try:
        import numpy as np
        import caffe
    except Exception as exc:
        emit({"engine": "unavailable", "reason": "pycaffe (Caffe) not installed: %s" % exc})
        return 1

    try:
        # Load network
        nsfw_net = caffe.Net(MODEL_DEF, MODEL_WEIGHTS, caffe.TEST)

        # Build transformer
        transformer = caffe.io.Transformer({"data": nsfw_net.blobs["data"].data.shape})
        transformer.set_transpose("data", (2, 0, 1))
        transformer.set_mean("data", np.array(MEAN))
        transformer.set_raw_scale("data", 255)
        transformer.set_channel_swap("data", (2, 1, 0))

        # Preprocess: resize -> center crop to network input size
        img_data_rs = resize_image(image_bytes)
        image = caffe.io.load_image(io.BytesIO(img_data_rs))
        H, W, _ = image.shape
        _, _, h, w = nsfw_net.blobs["data"].data.shape
        h_off = max((H - h) // 2, 0)
        w_off = max((W - w) // 2, 0)
        crop = image[h_off:h_off + h, w_off:w_off + w, :]

        transformed_image = transformer.preprocess("data", crop)
        transformed_image.shape = (1,) + transformed_image.shape

        input_name = nsfw_net.inputs[0]
        outputs = nsfw_net.forward_all(blobs=["prob"], **{input_name: transformed_image})
        score = float(outputs["prob"][0][1])  # index 1 = NSFW probability

        emit({"engine": "open_nsfw", "score": score})
        return 0
    except Exception as exc:
        emit({"engine": "unavailable", "reason": "inference error: %s" % exc})
        return 1


if __name__ == "__main__":
    sys.exit(main())
