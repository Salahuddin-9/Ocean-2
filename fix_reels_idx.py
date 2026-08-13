import sys
with open('src/App.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "setActiveImmersiveReelIndex(0);",
    "setActiveImmersiveReelIndex(filteredReels.findIndex(r => r.id === reel.id) !== -1 ? filteredReels.findIndex(r => r.id === reel.id) : 0);"
)

with open('src/App.tsx', 'w') as f:
    f.write(content)
print("Done")
