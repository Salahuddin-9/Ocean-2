import sys

with open('server.ts', 'r') as f:
    content = f.read()

if "import multer from" not in content:
    content = content.replace("import express from 'express';", "import express from 'express';\nimport multer from 'multer';")

target_start = "// FILE UPLOAD ENDPOINT"
start_idx = content.find(target_start)
if start_idx == -1:
    print("Could not find FILE UPLOAD ENDPOINT")
    sys.exit(1)

# Find the end by searching for the end of the catch block in the upload endpoint
end_str = "    return res.status(500).json({ error: 'Failed to save file on server' });\n  }\n});"
end_idx = content.find(end_str, start_idx)

if end_idx == -1:
    print("Could not find end of file upload endpoint")
    sys.exit(1)

end_idx += len(end_str)

new_endpoint = """// FILE UPLOAD ENDPOINT
const upload = multer({ dest: uploadsDir, limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB limit

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (req.file) {
      const ext = req.file.originalname.split('.').pop() || 'bin';
      const uniqueName = `media-${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
      const filePath = path.join(uploadsDir, uniqueName);
      fs.renameSync(req.file.path, filePath);
      const fileUrl = `/uploads/${uniqueName}`;
      console.log(`[Upload] File saved via multer: ${fileUrl}`);
      return res.json({ success: true, url: fileUrl });
    }

    // Fallback to legacy base64 upload logic
    const { fileData, fileName, fileType } = req.body || {};
    
    if (!fileData) {
      return res.status(400).json({ error: 'No file data provided' });
    }

    let buffer: Buffer;
    let ext = 'bin';

    const matches = typeof fileData === 'string' ? fileData.match(/^data:(.+);base64,(.+)$/) : null;
    if (matches && matches.length === 3) {
      const mime = matches[1];
      ext = mime.split('/')[1] || 'bin';
      if (ext === 'quicktime') ext = 'mp4';
      if (ext === 'mpeg') ext = 'mp3';
      if (ext === 'webm') ext = 'webm';
      buffer = Buffer.from(matches[2], 'base64');
    } else if (typeof fileData === 'string') {
      buffer = Buffer.from(fileData, 'base64');
      if (fileType) {
        ext = fileType.split('/')[1] || 'bin';
      }
    } else {
      buffer = Buffer.from(fileData);
    }

    if (fileName && fileName.includes('.')) {
      const parts = fileName.split('.');
      const fileExt = parts[parts.length - 1].toLowerCase();
      if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'm4a', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt)) {
        ext = fileExt;
      }
    }

    const uniqueName = `media-${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/${uniqueName}`;
    console.log(`[Upload] File saved legacy base64: ${fileUrl} (${buffer.length} bytes)`);
    return res.json({ success: true, url: fileUrl, filename: uniqueName });
  } catch (err: any) {
    console.error('[Upload] Error saving uploaded file:', err);
    return res.status(500).json({ error: 'Failed to save file on server' });
  }
});"""

content = content[:start_idx] + new_endpoint + content[end_idx:]

with open('server.ts', 'w') as f:
    f.write(content)

print("Done")
