import sys

with open('src/App.tsx', 'r') as f:
    content = f.read()

target = """                  <button
                    type="submit"
                    className="font-mono text-[10px] uppercase font-bold text-[#f4f1ea] bg-[#3a342a] hover:bg-[#52493b] px-4 py-2 rounded-xl shadow-md transition-colors"
                  >"""

replace = """                  <button
                    type="submit"
                    disabled={isUploadingPost || isUploadingMedia}
                    className={`font-mono text-[10px] uppercase font-bold text-[#f4f1ea] px-4 py-2 rounded-xl shadow-md transition-colors ${(isUploadingPost || isUploadingMedia) ? 'bg-[#8a8172] cursor-not-allowed' : 'bg-[#3a342a] hover:bg-[#52493b]'}`}
                  >
                    {isUploadingPost || isUploadingMedia ? <span className="animate-pulse">Processing...</span> : """

content = content.replace(target, replace)
# and close it correctly:
#                    {editingFeedPost ? "Save Modification" : "Publish to Feed"}
#                  </button>

target2 = """{editingFeedPost ? "Save Modification" : "Publish to Feed"}
                  </button>"""
replace2 = """{editingFeedPost ? "Save Modification" : "Publish to Feed"}}
                  </button>"""

content = content.replace(target2, replace2)

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done")
