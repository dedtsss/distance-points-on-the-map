# Image Host Finalists — 20 File Stream Test

Дата/время: 2026-07-02T20:16:24.068Z
Commit: 60234b0
Node: v22.22.3

Режим: 20 последовательных загрузок на сервис, пауза 150 мс; HEAD и два GET каждой direct-ссылки.

## Summary

| Provider | Method | Upload | URLs | Direct | Repeat GET | Exact bytes | 429 | Upload ms min/median/p95/max |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Freeimage.host | public-api | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 0 | 1127/1165/1317/1397 |
| x0.at | multipart-form | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 0 | 93/142/257/293 |

## Freeimage.host

Метод: public-api

| # | Bytes | Upload | ms | URL | GET/GET | Content-Type | Exact |
|---:|---:|---:|---:|---|---|---|---|
| 1 | 703397 | 200 | 1397 | https://freeimage.host/i/CYwknYF | 200/200 | image/png | yes |
| 2 | 704333 | 200 | 1304 | https://freeimage.host/i/CYwkuQR | 200/200 | image/png | yes |
| 3 | 387589 | 200 | 1170 | https://freeimage.host/i/CYwk0ps | 200/200 | image/png | yes |
| 4 | 332768 | 200 | 1156 | https://freeimage.host/i/CYwkXG2 | 200/200 | image/png | yes |
| 5 | 284384 | 200 | 1134 | https://freeimage.host/i/CYwkh4S | 200/200 | image/png | yes |
| 6 | 228029 | 200 | 1127 | https://freeimage.host/i/CYwkvTb | 200/200 | image/png | yes |
| 7 | 702598 | 200 | 1305 | https://freeimage.host/i/CYwkia1 | 200/200 | image/png | yes |
| 8 | 703381 | 200 | 1311 | https://freeimage.host/i/CYwkLyg | 200/200 | image/png | yes |
| 9 | 387768 | 200 | 1179 | https://freeimage.host/i/CYwkmnR | 200/200 | image/png | yes |
| 10 | 332400 | 200 | 1137 | https://freeimage.host/i/CYwvHFI | 200/200 | image/png | yes |
| 11 | 284651 | 200 | 1127 | https://freeimage.host/i/CYwvftf | 200/200 | image/png | yes |
| 12 | 228264 | 200 | 1129 | https://freeimage.host/i/CYwvCMl | 200/200 | image/png | yes |
| 13 | 703168 | 200 | 1296 | https://freeimage.host/i/CYwvzc7 | 200/200 | image/png | yes |
| 14 | 703128 | 200 | 1317 | https://freeimage.host/i/CYwv5tj | 200/200 | image/png | yes |
| 15 | 387659 | 200 | 1165 | https://freeimage.host/i/CYwvaMQ | 200/200 | image/png | yes |
| 16 | 332430 | 200 | 1151 | https://freeimage.host/i/CYwvWNa | 200/200 | image/png | yes |
| 17 | 284435 | 200 | 1160 | https://freeimage.host/i/CYwvNPp | 200/200 | image/png | yes |
| 18 | 228276 | 200 | 1130 | https://freeimage.host/i/CYwvURn | 200/200 | image/png | yes |
| 19 | 703141 | 200 | 1313 | https://freeimage.host/i/CYwviil | 200/200 | image/png | yes |
| 20 | 704594 | 200 | 1309 | https://freeimage.host/i/CYw89xj | 200/200 | image/png | yes |

## x0.at

Метод: multipart-form

| # | Bytes | Upload | ms | URL | GET/GET | Content-Type | Exact |
|---:|---:|---:|---:|---|---|---|---|
| 1 | 703397 | 200 | 246 | https://x0.at/ZlxAan8muunb.png | 200/200 | image/png | yes |
| 2 | 704333 | 200 | 179 | https://x0.at/n_34fl52L0FJ.png | 200/200 | image/png | yes |
| 3 | 387589 | 200 | 127 | https://x0.at/5h1xFiQ9k4xm.png | 200/200 | image/png | yes |
| 4 | 332768 | 200 | 178 | https://x0.at/dmQIZ0gBBSF2.png | 200/200 | image/png | yes |
| 5 | 284384 | 200 | 115 | https://x0.at/O3Ku3eOhf0Lb.png | 200/200 | image/png | yes |
| 6 | 228029 | 200 | 118 | https://x0.at/O371D0UX0pXQ.png | 200/200 | image/png | yes |
| 7 | 702598 | 200 | 163 | https://x0.at/KeHuiwY1bBbk.png | 200/200 | image/png | yes |
| 8 | 703381 | 200 | 179 | https://x0.at/egzbZSydNp7_.png | 200/200 | image/png | yes |
| 9 | 387768 | 200 | 129 | https://x0.at/9NVZdC8XX0eH.png | 200/200 | image/png | yes |
| 10 | 332400 | 200 | 116 | https://x0.at/a27g3Yfu-UWE.png | 200/200 | image/png | yes |
| 11 | 284651 | 200 | 117 | https://x0.at/rTu6LFZOdfLD.png | 200/200 | image/png | yes |
| 12 | 228264 | 200 | 93 | https://x0.at/gbfJxcZAbUo7.png | 200/200 | image/png | yes |
| 13 | 703168 | 200 | 176 | https://x0.at/cb3EIUxdOpWm.png | 200/200 | image/png | yes |
| 14 | 703128 | 200 | 159 | https://x0.at/RHB5t-NXl1Go.png | 200/200 | image/png | yes |
| 15 | 387659 | 200 | 293 | https://x0.at/e_5I_KxpZHQm.png | 200/200 | image/png | yes |
| 16 | 332430 | 200 | 121 | https://x0.at/pMZCH3pppnLs.png | 200/200 | image/png | yes |
| 17 | 284435 | 200 | 112 | https://x0.at/RDRsP2kyZYeB.png | 200/200 | image/png | yes |
| 18 | 228276 | 200 | 142 | https://x0.at/UPNN0Y0-kJkU.png | 200/200 | image/png | yes |
| 19 | 703141 | 200 | 257 | https://x0.at/HhTjXnuUJ1Y6.png | 200/200 | image/png | yes |
| 20 | 704594 | 200 | 182 | https://x0.at/j8eooocLgQxO.png | 200/200 | image/png | yes |

## Conclusion

Both finalists accepted all 20 files and returned reusable public links; see latency and integrity results above.
