with open('server.ts', 'r') as f:
    lines = f.readlines()

# The original file's first few lines were:
# import express from 'express';
# import path from 'path';
# import fs from 'fs';
# import crypto from 'crypto';

# lines[756] is "import crypto from 'crypto';\\n"
# So lines[756:] is the original file from line 4 down.

original_content = "import express from 'express';\nimport path from 'path';\nimport fs from 'fs';\n" + "".join(lines[756:])

with open('server.ts', 'w') as f:
    f.write(original_content)

print("Restored original server.ts")
