# Image Host Lab Report

Дата/время: 2026-07-02T01:36:16.000Z
Commit: 60234b0
Node version: v22.22.3

## Summary

| Provider | Result | Upload | Public URL | Direct image | Repeat GET | Account/key | Verdict |
|---|---|---|---|---|---|---|---|
| 0x0.st | FAIL | 0/2 | no | no | no | not required | no |
| x0.at | PASS | 2/2 | yes | yes | yes | not required | yes |
| Pixeldrain | FAIL | 0/2 | no | no | no | required | no |
| Gofile | PARTIAL | 2/2 | yes | no | yes | not required | partial |
| Bashify | FAIL | 0/2 | no | no | no | not required | no |
| vgy.me | FAIL | 0/2 | no | no | no | required | no |

## Provider details

### 0x0.st

- Upload result: 0/2 successful (503, 503)
- Returned URL: none
- GET result: not tested
- Share page GET: not tested
- Direct image: no
- Measurements: small: 4473 bytes, upload 116 ms, URL checks not available; medium: 2483423 bytes, upload 13 ms, URL checks not available
- Retention: Requested 180 days; host documents 30 days to 1 year depending on file size.
- Metadata/EXIF: NOT_TESTED (fixtures intentionally contain no EXIF); byte-for-byte integrity: not verified
- Warnings: Public single-operator service; not suitable for confidential or mass automated uploads. The service explicitly reports that uploads are currently disabled with no ETA.
- Final verdict: FAIL
- Suitable for GPS Checker: no

### x0.at

- Upload result: 2/2 successful (200, 200)
- Returned URL: https://x0.at/C51JT9zaB54s.png, https://x0.at/G16alBTXpBNT.png
- GET result: 200/200, 200/200
- Share page GET: same as direct URL or not tested, same as direct URL or not tested
- Direct image: yes
- Measurements: small: 4473 bytes, upload 472 ms, HEAD 46 ms; GET 8/27 ms; medium: 2483423 bytes, upload 363 ms, HEAD 11 ms; GET 105/144 ms
- Retention: 3 to 100 days depending on file size; small image files should be near the upper bound.
- Metadata/EXIF: NOT_TESTED (fixtures intentionally contain no EXIF); byte-for-byte integrity: preserved
- Warnings: Retention is size-dependent and cannot be requested explicitly. Upload response declares text/html even though its body is a plain-text URL.
- Final verdict: PASS
- Suitable for GPS Checker: yes

### Pixeldrain

- Upload result: 0/2 successful (401, 401)
- Returned URL: none
- GET result: not tested
- Share page GET: not tested
- Direct image: no
- Measurements: small: 4473 bytes, upload 19 ms, URL checks not available; medium: 2483423 bytes, upload 22 ms, URL checks not available
- Retention: 60 days after the last qualifying download on the free sharing service.
- Metadata/EXIF: NOT_TESTED (fixtures intentionally contain no EXIF); byte-for-byte integrity: not verified
- Warnings: Current API documentation says uploads require an account and API key. Direct downloads can be rate-limited; CAPTCHA is served on the viewer page and hotlinking is restricted. Anonymous PUT was attempted without an account or API key. Pixeldrain explicitly rejected the upload because authentication is required.
- Final verdict: FAIL
- Suitable for GPS Checker: no

### Gofile

- Upload result: 2/2 successful (200, 200)
- Returned URL: https://gofile.io/d/uHKuHs, https://gofile.io/d/aL2tag
- GET result: not tested, not tested
- Share page GET: 200/200, 200/200
- Direct image: no
- Measurements: small: 4473 bytes, upload 20953 ms, share GET 63/14 ms; medium: 2483423 bytes, upload 17563 ms, share GET 48/13 ms
- Retention: Guest/free content defaults to 10 days and can last longer while actively downloaded.
- Metadata/EXIF: NOT_TESTED (fixtures intentionally contain no EXIF); byte-for-byte integrity: not verified
- Warnings: Guest upload is supported without an account or token. Official direct links for embedding/integrations are a Premium feature; guest upload normally returns a download page. Upload returned a public download page, not a direct image URL.
- Final verdict: PARTIAL
- Suitable for GPS Checker: partial

### Bashify

- Upload result: 0/2 successful (200, 200)
- Returned URL: none
- GET result: not tested
- Share page GET: not tested
- Direct image: no
- Measurements: small: 4473 bytes, upload 132 ms, URL checks not available; medium: 2483423 bytes, upload 169 ms, URL checks not available
- Retention: The form offers 6 months or 1 year; this lab requests 6 months.
- Metadata/EXIF: NOT_TESTED (fixtures intentionally contain no EXIF); byte-for-byte integrity: not verified
- Warnings: Uploads are advertised as anonymous, but the web upload flow requires a reCAPTCHA v3 token. The FAQ states that direct image access is referrer-dependent. No CAPTCHA token was supplied; the lab does not bypass anti-bot protection. Bashify rejected the automated upload because CAPTCHA validation failed.
- Final verdict: FAIL
- Suitable for GPS Checker: no

### vgy.me

- Upload result: 0/2 successful (422, 422)
- Returned URL: none
- GET result: not tested
- Share page GET: not tested
- Direct image: no
- Measurements: small: 4473 bytes, upload 81 ms, URL checks not available; medium: 2483423 bytes, upload 100 ms, URL checks not available
- Retention: No fixed retention period is stated in the public API or terms.
- Metadata/EXIF: NOT_TESTED (fixtures intentionally contain no EXIF); byte-for-byte integrity: not verified
- Warnings: The public API page documents anonymous multipart uploads, but the live endpoint currently requires authorization. Mass uploads without prior approval are prohibited; this lab sends only two files. The live endpoint rejected anonymous upload and requires an account user key.
- Final verdict: FAIL
- Suitable for GPS Checker: no

## Recommendation

1. Лучший кандидат: x0.at.
2. Второй кандидат: Gofile.
3. Не использовать: 0x0.st, Pixeldrain, Bashify, vgy.me.
4. Что нужно сделать дальше: Before production integration, repeat from the deployed Cloudflare Worker egress and review x0.at usage/privacy terms.
