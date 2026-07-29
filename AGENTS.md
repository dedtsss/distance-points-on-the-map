# Distance Points on the Map — agent rules

This is the canonical rule file. Read the task/Issue, this file, and only relevant files.

- Make the smallest correct change on a focused branch; preserve unrelated work and avoid speculative features or broad refactors.
- Keep GPS/EXIF processing in the browser. Do not add a backend, accounts, database, maps, or history unless explicitly required.
- Do not hardcode ImgBB or other secrets. Never upload original photos or raw metadata; keep uploads behind the Cloudflare Worker and retain privacy behaviour.
- Be careful with metadata stripping and EXIF orientation across browsers/devices.
- Do not merge or change deployment/runtime access without explicit authorization.

Run `npm run build` when applicable and report exact verification, changed files, and any browser/mobile checks still needed.
