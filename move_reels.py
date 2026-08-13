import sys

with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

start_idx = 6166 - 1
end_idx = 6535 - 1

# extract the block
block = lines[start_idx:end_idx+1]

# delete from original location
del lines[start_idx:end_idx+1]

# find insertion point: right before IMMERSIVE MEDIA DIVER (SWIPABLE/SCROLLABLE FULLSCREEN REELS FOR VIDEOS & AUDIOS)
insert_idx = -1
for i, line in enumerate(lines):
    if "IMMERSIVE MEDIA DIVER (SWIPABLE/SCROLLABLE FULLSCREEN REELS FOR VIDEOS & AUDIOS)" in line:
        insert_idx = i - 1
        break

if insert_idx == -1:
    print("Could not find insertion point!")
    sys.exit(1)

# insert
lines = lines[:insert_idx] + block + lines[insert_idx:]

with open('src/App.tsx', 'w') as f:
    f.writelines(lines)

print("Success!")
