import sys

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Add isUploadingMedia state
state_target = "  const [isUploadingPost, setIsUploadingPost] = useState(false);"
state_replacement = "  const [isUploadingPost, setIsUploadingPost] = useState(false);\n  const [isUploadingMedia, setIsUploadingMedia] = useState(false);"

content = content.replace(state_target, state_replacement)

# Update Image Upload
img_upload_target = """                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            showToast("🖼️ Uploading image...");
                            uploadMediaFile(file).then(url => {
                              setAttachedImage(url);
                              showToast("✅ Image attached!");
                            }).catch(() => {
                              compressAndAttachImage(file, (compressedBase64) => {
                                setAttachedImage(compressedBase64);
                              });
                            });
                          }
                        }}"""

img_upload_replace = """                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setIsUploadingMedia(true);
                            showToast("🖼️ Uploading image...");
                            try {
                              const url = await uploadMediaFile(file);
                              setAttachedImage(url);
                              showToast("✅ Image attached!");
                            } catch (err) {
                              compressAndAttachImage(file, (compressedBase64) => {
                                setAttachedImage(compressedBase64);
                              });
                            } finally {
                              setIsUploadingMedia(false);
                            }
                          }
                        }}"""

content = content.replace(img_upload_target, img_upload_replace)


# Update Video Upload
vid_upload_target = """                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 100 * 1024 * 1024) { // 100MB Limit
                              showToast("⚠️ Video file is too large. Please upload a video under 100MB.");
                              return;
                            }
                            showToast("⏳ Processing & uploading video to network server...");
                            uploadMediaFile(file).then(url => {
                              setAttachedVideo(url);
                              showToast("🎬 Video attached & saved successfully!");
                            }).catch(err => {
                              console.error("Video upload error:", err);
                              showToast("⚠️ Failed to upload video.");
                            });
                          }
                        }}"""

vid_upload_replace = """                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 200 * 1024 * 1024) { // 200MB Limit
                              showToast("⚠️ Video file is too large. Please upload a video under 200MB.");
                              return;
                            }
                            setIsUploadingMedia(true);
                            showToast("⏳ Processing & uploading video to network server...");
                            try {
                              const url = await uploadMediaFile(file);
                              setAttachedVideo(url);
                              showToast("🎬 Video attached & saved successfully!");
                            } catch (err) {
                              console.error("Video upload error:", err);
                              showToast("⚠️ Failed to upload video.");
                            } finally {
                              setIsUploadingMedia(false);
                            }
                          }
                        }}"""

content = content.replace(vid_upload_target, vid_upload_replace)


# Update the label to disable when uploading
label_img = """<label className="flex flex-col items-center justify-center p-2.5 bg-white rounded-xl border border-[#ebdcca] hover:border-[#8a8172] cursor-pointer text-center select-none" title="Add Image">
                      <Image size={16} className="text-[#8a8172]" />"""
label_img_rep = """<label className={`flex flex-col items-center justify-center p-2.5 bg-white rounded-xl border border-[#ebdcca] ${isUploadingMedia ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#8a8172] cursor-pointer'} text-center select-none`} title="Add Image">
                      <Image size={16} className={isUploadingMedia ? "text-amber-500 animate-pulse" : "text-[#8a8172]"} />"""

content = content.replace(label_img, label_img_rep)

label_vid = """<label className="flex flex-col items-center justify-center p-2.5 bg-white rounded-xl border border-[#ebdcca] hover:border-[#8a8172] cursor-pointer text-center select-none" title="Add Video">
                      <Video size={16} className="text-[#8a8172]" />"""
label_vid_rep = """<label className={`flex flex-col items-center justify-center p-2.5 bg-white rounded-xl border border-[#ebdcca] ${isUploadingMedia ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#8a8172] cursor-pointer'} text-center select-none`} title="Add Video">
                      <Video size={16} className={isUploadingMedia ? "text-amber-500 animate-pulse" : "text-[#8a8172]"} />"""

content = content.replace(label_vid, label_vid_rep)

# We should also disable the input itself so we can't click it multiple times
content = content.replace("""type="file"\n                        accept="image/*"\n                        className="hidden\"""", """type="file"\n                        accept="image/*"\n                        className="hidden"\n                        disabled={isUploadingMedia}""")
content = content.replace("""type="file"\n                        accept="video/*"\n                        className="hidden\"""", """type="file"\n                        accept="video/*"\n                        className="hidden"\n                        disabled={isUploadingMedia}""")


with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done")
