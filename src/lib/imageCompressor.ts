/**
 * Compresses an image base64 data-URL using a canvas, ensuring it is kept under Firestore document size limits.
 */
export function compressImage(
  base64Str: string,
  maxWidth = 550,
  maxHeight = 550,
  quality = 0.5
): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith("data:image/")) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = base64Str;
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Export as highly compressed JPEG
          const compressed = canvas.toDataURL("image/jpeg", quality);
          resolve(compressed);
        } else {
          resolve(base64Str);
        }
      } catch (e) {
        console.error("Canvas compression error, using fallback format", e);
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      console.warn("Could not load image for compression");
      resolve(base64Str);
    };
  });
}
