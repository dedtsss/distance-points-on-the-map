# Image hosting decision

Decision date: 2026-07-03

Status: provider evaluation and application/Worker integration are complete locally; production deploy and real-photo browser validation remain.

## Accepted provider order

| Priority | Provider | Role | Link stored for each photo |
|---:|---|---|---|
| 1 | Freeimage.host | Default primary | `image.url_viewer` (`https://freeimage.host/i/...`) |
| 2 | Ninjabox.org | Default secondary | Individual photo page (`https://ninjabox.org/i/...`), not the common gallery URL |
| 3 | x0.at | Conditional fallback | Direct URL returned by the multipart upload |

For every cleaned photo, the normal result must contain two links: one from Freeimage and one from Ninjabox.

x0.at is not uploaded to during a fully successful normal operation. It is used when Freeimage or Ninjabox fails or exceeds its timeout. If both default providers fail, x0.at can supply one fallback link; the response must still report both primary failures rather than pretending that two independent copies exist.

## Implemented orchestration

1. Start Freeimage and Ninjabox uploads without making either provider block the other.
2. Use explicit per-provider timeouts and collect results with `Promise.allSettled` semantics.
3. If both succeed, return their two per-photo links and do not call x0.at.
4. If either default provider fails or times out, upload the same cleaned file to x0.at and use its URL in place of the failed provider's link.
5. Preserve provider names, URLs, timings, and errors in the normalized result.
6. Never upload an uncleaned original photo or include EXIF/GPS metadata.

Ninjabox accepts multiple files in one multipart request and returns one gallery containing individual `/i/<id>` links. Integration must map those individual links back to their source photos; the common gallery URL is additional information, not the per-photo result.

## Freeimage public key handling

The API key shown on `https://freeimage.host/api` is public. Keep the known value in Worker configuration/runtime cache, upload with it, and on an invalid-key response fetch `/api`, parse the current key, and retry once. A short TTL refresh is acceptable; fetching and comparing the HTML page before every photo is unnecessary and creates an extra failure dependency.

## Acceptance criterion clarification

The application only needs to obtain and store the returned public links. It does not need to render or automatically download Ninjabox images. Therefore, Ninjabox's Cloudflare challenge on direct non-browser GET requests is recorded as an operational risk, not a rejection criterion.

Ninjabox verdict for this link-only scenario: **PASS through Cloudflare Worker**.

## Evidence

- `results/finalists-latest.md` — 20-file Freeimage/x0 stream test.
- `results/cloudflare-egress-latest.md` — Freeimage/x0 Cloudflare egress test.
- `results/ninjabox-direct-latest.md` — direct Node upload was challenged.
- `results/ninjabox-cloudflare-latest.md` — Cloudflare batch upload returned one gallery, 10 individual photo pages, and 10 direct image URLs.

## Integration status

- Production Worker targets `bundle`, `freeimage`, `ninjabox`, and `x0` are implemented.
- The frontend sends one cleaned batch and renders two normalized links per photo.
- x0 fallback composition has automated tests.
- Legacy hosting selector, manual parser, adapters, ImgBB secret sync, and old provider code are removed.
- A temporary Cloudflare deployment passed live `bundle` and `x0` smoke tests.
- Remaining: deploy to the permanent Worker and validate with real cleaned photos in the browser.
