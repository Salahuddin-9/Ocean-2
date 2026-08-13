import sys

with open('src/App.tsx', 'r') as f:
    content = f.read()

target = """{isUploadingPost || isUploadingMedia ? <span className="animate-pulse">Processing...</span> : 
                    {editingFeedPost ? "Save Modification" : "Publish to Feed"}}"""
replace = """{isUploadingPost || isUploadingMedia ? <span className="animate-pulse">Processing...</span> : 
                    (editingFeedPost ? "Save Modification" : "Publish to Feed")}"""

content = content.replace(target, replace)

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done")
