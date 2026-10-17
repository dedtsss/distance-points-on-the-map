package app.darkfoto.mvp;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.android.apksig.ApkVerifier;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.List;

@CapacitorPlugin(name = "DarkFotoUpdate")
public class DarkFotoUpdatePlugin extends Plugin {
    static final String PACKAGE_ID = "app.darkfoto.mvp";
    static final String SIGNER_SHA256 = "891566581d0fe0b9d879c977cdc978fc4068a660db2146a2e39548f7cfafbbb4";
    private static final long MAX_APK_BYTES = 100L * 1024 * 1024;
    private static final String PREFS = "darkfoto-update";
    private volatile boolean verifying;

    @Override
    public void load() {
        super.load();
        // Recheck the retained file after process/plugin recreation before presenting it as ready.
        if (prefs().getBoolean("verified", false)) prefs().edit().putBoolean("verified", false).commit();
    }

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private DownloadManager manager() { return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE); }
    private File target() {
        File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) throw new IllegalStateException("Update storage unavailable");
        return new File(directory, "darkfoto-update.apk");
    }

    @PluginMethod
    public void installedVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(PACKAGE_ID, 0);
            JSObject result = new JSObject();
            result.put("name", "DarkCat Photo");
            result.put("versionName", info.versionName);
            result.put("versionCode", code(info));
            call.resolve(result);
        } catch (Exception error) { call.reject("Installed version unavailable", error); }
    }

    static boolean acceptedCandidate(String packageName, long candidateCode, long installedCode,
                                     String actualDigest, String expectedDigest, String signerDigest) {
        return PACKAGE_ID.equals(packageName) && candidateCode > installedCode
            && expectedDigest != null && expectedDigest.matches("(?i)[0-9a-f]{64}")
            && expectedDigest.equalsIgnoreCase(actualDigest)
            && SIGNER_SHA256.equalsIgnoreCase(signerDigest);
    }

    static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) value.append(String.format(java.util.Locale.ROOT, "%02x", b & 0xff));
        return value.toString();
    }

    static long code(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    static String verifiedSignerDigest(File apk) throws Exception {
        ApkVerifier.Result verification = new ApkVerifier.Builder(apk).build().verify();
        if (!verification.isVerified()) throw new IllegalArgumentException("APK signature verification failed");
        List<X509Certificate> certificates = verification.getSignerCertificates();
        if (certificates == null || certificates.size() != 1)
            throw new IllegalArgumentException("APK signing certificate unavailable");
        return hex(MessageDigest.getInstance("SHA-256").digest(certificates.get(0).getEncoded()));
    }

    private synchronized void invalidate() {
        long id = prefs().getLong("id", -1);
        if (id >= 0) manager().remove(id);
        File apk = target();
        if (apk.exists() && !apk.delete()) throw new IllegalStateException("Stale update file could not be removed");
        prefs().edit().clear().commit();
    }

    private void validate(String source, String digest) {
        if (!source.matches("https://github\\.com/dedtsss/distance-points-on-the-map/releases/download/[^?#]+\\.apk")
            || !digest.matches("(?i)[0-9a-f]{64}"))
            throw new IllegalArgumentException("Invalid public DarkCat Photo release URL or digest");
    }

    private synchronized void selectCandidate(String version, String source, String digest) {
        validate(source, digest);
        SharedPreferences p = prefs();
        if (!UpdateDownloadState.sameCandidate(version, source, digest,
                p.getString("version", ""), p.getString("url", ""), p.getString("sha256", ""))) {
            invalidate();
            p.edit().putString("version", version).putString("url", source)
                .putString("sha256", digest).commit();
        }
    }

    private long verifyFile() throws Exception {
        File apk = target();
        long size = apk.length();
        if (size <= 0 || size > MAX_APK_BYTES) throw new IllegalArgumentException("APK is empty or exceeds 100 MiB");
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(apk)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) sha.update(buffer, 0, count);
        }
        PackageManager pm = getContext().getPackageManager();
        PackageInfo candidate = pm.getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        PackageInfo installed = pm.getPackageInfo(PACKAGE_ID, 0);
        if (candidate == null) throw new IllegalArgumentException("APK package metadata unavailable");
        String signer = verifiedSignerDigest(apk);
        if (!acceptedCandidate(candidate.packageName, code(candidate), code(installed),
                hex(sha.digest()), prefs().getString("sha256", ""), signer))
            throw new IllegalArgumentException("APK package, version, digest or signer verification failed");
        return code(candidate);
    }

    private synchronized void startVerification() {
        if (verifying) return;
        verifying = true;
        new Thread(() -> {
            synchronized (this) {
                try {
                    long verifiedCode = verifyFile();
                    prefs().edit().putBoolean("verified", true).putLong("verifiedCode", verifiedCode)
                        .remove("error").commit();
                } catch (Exception error) {
                    String detail = "Update rejected: " + error.getMessage();
                    try { invalidate(); } catch (Exception ignored) { /* report original verification error */ }
                    prefs().edit().putString("error", detail).commit();
                } finally { verifying = false; }
            }
        }, "darkfoto-verify-update").start();
    }

    private JSObject state() {
        SharedPreferences p = prefs();
        if (p.contains("verifiedCode")) {
            try {
                long installed = code(getContext().getPackageManager().getPackageInfo(PACKAGE_ID, 0));
                if (installed >= p.getLong("verifiedCode", Long.MAX_VALUE)) {
                    invalidate();
                    p = prefs();
                }
            } catch (Exception ignored) { /* installed version is queried separately */ }
        }
        JSObject result = new JSObject();
        result.put("version", p.getString("version", ""));
        result.put("url", p.getString("url", ""));
        result.put("sha256", p.getString("sha256", ""));
        result.put("downloadId", p.getLong("id", -1));
        result.put("downloadedBytes", 0);
        result.put("totalBytes", -1);
        if (p.contains("error")) {
            result.put("state", "failed");
            result.put("error", p.getString("error", ""));
            return result;
        }
        long id = p.getLong("id", -1);
        if (id < 0) { result.put("state", "idle"); return result; }
        if (p.contains("verifiedCode") && target().isFile()) {
            long size = target().length();
            result.put("downloadedBytes", size);
            result.put("totalBytes", size);
            result.put("fraction", 1);
            if (p.getBoolean("verified", false)) {
                result.put("state", UpdateDownloadState.verifiedState(true, Build.VERSION.SDK_INT < 26
                    || getContext().getPackageManager().canRequestPackageInstalls()));
            } else {
                result.put("state", "verifying");
                startVerification();
            }
            return result;
        }
        try (Cursor cursor = manager().query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) {
                result.put("state", "failed");
                result.put("error", "DownloadManager entry unavailable");
                return result;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long bytes = Math.max(0, cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            result.put("downloadedBytes", bytes);
            result.put("totalBytes", total);
            double fraction = UpdateDownloadState.fraction(bytes, total);
            if (fraction >= 0) result.put("fraction", fraction);
            String mapped = UpdateDownloadState.map(status);
            if ("completed".equals(mapped)) {
                if (!target().isFile()) {
                    result.put("state", "failed");
                    result.put("error", "Downloaded APK missing");
                } else if (p.getBoolean("verified", false)) {
                    result.put("state", UpdateDownloadState.verifiedState(true, Build.VERSION.SDK_INT < 26
                        || getContext().getPackageManager().canRequestPackageInstalls()));
                } else {
                    result.put("state", verifying ? "verifying" : "completed");
                    startVerification();
                }
            } else {
                result.put("state", mapped);
                if ("failed".equals(mapped)) result.put("error", "DownloadManager failed (reason "
                    + cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)) + ")");
            }
        }
        return result;
    }

    @PluginMethod
    public void queryState(PluginCall call) {
        try {
            if (call.getBoolean("clear", false)) invalidate();
            String source = call.getString("url");
            if (source != null) selectCandidate(call.getString("version", ""), source,
                call.getString("sha256", "").replaceFirst("(?i)^sha256:", ""));
            call.resolve(state());
        } catch (Exception error) { call.reject("Update state unavailable: " + error.getMessage(), error); }
    }

    @PluginMethod
    public void startDownload(PluginCall call) {
        try {
            String source = call.getString("url", "");
            selectCandidate(call.getString("version", ""), source,
                call.getString("sha256", "").replaceFirst("(?i)^sha256:", ""));
            if (UpdateDownloadState.shouldEnqueue(prefs().getLong("id", -1), state().getString("state"))) {
                invalidate();
                selectCandidate(call.getString("version", ""), source,
                    call.getString("sha256", "").replaceFirst("(?i)^sha256:", ""));
                File apk = target();
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(source));
                request.setDestinationUri(Uri.fromFile(apk));
                request.setTitle("DarkCat Photo " + call.getString("version", ""));
                request.setDescription("Загрузка обновления DarkCat Photo");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(false);
                long id = manager().enqueue(request);
                prefs().edit().putLong("id", id).commit();
            }
            call.resolve(state());
        } catch (Exception error) { call.reject("Download unavailable: " + error.getMessage(), error); }
    }

    @PluginMethod
    public void installVerified(PluginCall call) {
        new Thread(() -> {
            synchronized (this) {
                try {
                    if (!prefs().getBoolean("verified", false) || !target().isFile())
                        throw new IllegalStateException("No verified APK available");
                    verifyFile();
                } catch (Exception error) {
                    try { invalidate(); } catch (Exception ignored) { /* report original error */ }
                    prefs().edit().putString("error", "Update rejected: " + error.getMessage()).commit();
                    call.reject("Update rejected: " + error.getMessage(), error);
                    return;
                }
                try {
                    PackageManager pm = getContext().getPackageManager();
                    if (Build.VERSION.SDK_INT >= 26 && !pm.canRequestPackageInstalls()) {
                        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + PACKAGE_ID));
                        settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(settings);
                    } else {
                        Uri uri = FileProvider.getUriForFile(getContext(), PACKAGE_ID + ".fileprovider", target());
                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(uri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(intent);
                    }
                    call.resolve(state());
                } catch (Exception error) {
                    // A failed Settings/installer launch must not discard a verified APK.
                    call.reject("Installer unavailable: " + error.getMessage(), error);
                }
            }
        }, "darkfoto-install-update").start();
    }
}
