# Cloudflare Worker Egress — Image Host Test

Дата/время: 2026-07-02T20:34:00.724Z
Worker: temporary workers.dev deployment

| Provider | Scenario | File | Worker | Edge | Upload | Key check | GET/GET | Type | Exact | Total ms |
|---|---|---:|---:|---|---:|---|---|---|---|---:|
| Freeimage.host | current-key | 4473 B | 200 | FRA | 200 | matched | 200/200 | image/png | yes | 1955 |
| Freeimage.host | current-key | 787508 B | 200 | FRA | 200 | matched | 200/200 | image/png | yes | 981 |
| x0.at | current-key | 4473 B | 200 | FRA | 200 | n/a | 200/200 | image/png | yes | 288 |
| x0.at | current-key | 787508 B | 200 | FRA | 200 | n/a | 200/200 | image/png | yes | 530 |
| Freeimage.host | stale-key-refresh | 4473 B | 200 | FRA | 200 | refreshed | 200/200 | image/png | yes | 273 |

Итог: PASS — оба сервиса работают через Cloudflare Worker egress.
