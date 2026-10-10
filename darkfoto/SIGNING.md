# DarkFoto Android signing

DarkFoto installable APKs use one permanent application-specific signer.

- applicationId: `app.darkfoto.mvp`
- permanent signer SHA-256 certificate fingerprint:
  `89:15:66:58:1D:0F:E0:B9:D8:79:C9:77:CD:C9:78:FC:40:68:A6:60:DB:21:46:A2:E3:95:48:F7:CF:AF:BB:B4`
- CI produces an **unsigned release APK** only.
- Final installable APK signing is performed on the authorized Bruce signing host with the persistent DarkFoto signer.
- The signing key and credential are never stored in Git.
- Missing/unavailable signer is a hard delivery stop. Do not fall back to a debug keystore.
- Every changed installable APK must increment `versionCode` and use a new visible `versionName`.

The first permanent-signed baseline is version `0.1.2`, versionCode `2`.

Any older debug-signed DarkFoto APK is outside the permanent signing lineage and may require one clean uninstall before installing 0.1.2. From 0.1.2 onward, updates must preserve this signer.
