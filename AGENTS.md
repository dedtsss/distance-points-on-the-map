# AGENTS.md

Guidance for Codex, Copilot coding agent and other AI coding agents working on this repository.

## Core coding-agent rules

These rules are adapted from the Karpathy-style coding-agent guidelines and the project CODEX.md rules.

### 1. Think before coding

- Inspect the real repository before changing files.
- Do not assume missing requirements silently.
- State assumptions when they affect implementation.
- If a request has several meanings, choose the safest small interpretation and say so, or ask when the wrong choice would be costly.
- Push back when a simpler or safer approach exists.

### 2. Simplicity first

- Write the minimum code that solves the task.
- Do not add speculative features, abstractions, configuration, or frameworks.
- Prefer clear, boring code over clever code.
- If the change becomes large, re-check whether a smaller change is enough.

### 3. Surgical changes

- Touch only files directly needed for the task.
- Do not refactor, rename, reformat, or clean adjacent code unless required.
- Match existing style.
- Preserve unrelated user changes.
- Remove only unused code created by your own change.

### 4. Goal-driven execution

- Convert the task into verifiable success criteria.
- For bugs, reproduce the bug first when practical, then fix it.
- Run the smallest relevant check before claiming completion.
- Report changed files, verification performed, and anything not tested.

## Project profile

This is a Vite + React web application for checking distances between GPS points in photos.

Main behavior:
- select several photos in the browser;
- read EXIF GPS locally with `exifr`;
- calculate distances using Haversine;
- highlight photos that are closer than the configured threshold;
- create cleaned JPEG copies before upload;
- never upload original files.

## Project-specific constraints

- Keep GPS/EXIF processing local in the browser unless explicitly requested otherwise.
- Do not add a backend, account system, database, maps, or history unless the task explicitly requires it.
- Do not hardcode ImgBB keys or any other secrets.
- Be careful with browser canvas behavior: metadata stripping and EXIF orientation can differ by browser/device.
- Keep Catbox/ImgBB upload behavior explicit and session-bound.
- Do not weaken privacy behavior by sending original images or raw metadata to external services.

## Useful commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Expected workflow

Before final response:
- state changed files;
- state exact verification command and result;
- if `npm run build` was not run, explain why;
- mention any manual browser/mobile checks still needed.
