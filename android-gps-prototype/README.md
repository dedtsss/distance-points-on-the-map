# Road GPS Logger v0.2.0

Temporary Android prototype for recording phone GPS points while the phone is connected to the car router Wi-Fi.
The prototype has no map, server, authentication, OpenWrt integration, or background upload.

## Features

- Start and stop GPS recording from one simple screen.
- Foreground service keeps recording while the app is in the background.
- Requests `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, and `POST_NOTIFICATIONS` on Android 13+.
- Saves CSV files in app internal storage under `gps_logs/`.
- CSV filename format: `road_gps_YYYYMMDD_HHMMSS.csv`.
- CSV columns: `time,lat,lon,accuracy_m,altitude_m,speed_mps,bearing_deg,provider,internet_ok,internet_latency_ms`.
- `internet_ok` is written as `1` (reachable) or `0` (not reachable) through Android's active network check to `1.1.1.1:53`; `internet_latency_ms` stores the measured connect latency in milliseconds, or `-1` when unavailable.
- Shares the latest CSV through the Android share sheet.

## Build locally

From this directory:

```bash
gradle assembleDebug --stacktrace
```

The debug APK is written to:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## GitHub Actions APK download

1. Open the repository's **Actions** tab.
2. Select the **Android GPS Prototype APK** workflow.
3. Open the latest successful run for the branch or pull request.
4. Download the artifact named **AndroidGpsPrototype-debug-apk**.
5. Extract the artifact zip and install `app-debug.apk` on the Android device.

## Notes for field use

- Keep the phone connected to the car router Wi-Fi before starting recording.
- Mobile data may be disabled; the app uses the active Android network for the internet check.
- Battery optimization settings can still affect long recordings on some Android devices, so a manual road test is required before relying on the prototype.

## Signing notes (dev/test)

- GitHub Actions now decodes and uses a stable development/debug signing key for APK builds.
- After installing the first APK built with this stable dev key, future APKs should install over it.
- If you installed an older APK from before this signing change, uninstall it once before installing the new APK.
- This signing is for development/testing only and is not production signing.
