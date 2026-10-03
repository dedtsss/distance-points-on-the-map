package app.darkfoto.mvp;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "DarkFotoUpdate")
public class DarkFotoUpdatePlugin extends Plugin {
    static final String PACKAGE_ID = "app.darkfoto.mvp";
    static final String SIGNER_SHA256 = "891566581d0fe0b9d879c977cdc978fc4068a660db2146a2e39548f7cfafbbb4";
    private static final long MAX_APK_BYTES = 100L * 1024 * 1024;

    @PluginMethod
    public void installedVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(PACKAGE_ID, 0);
            JSObject result = new JSObject();
            result.put("name", "DarkFoto");
            result.put("versionName", info.versionName);
            result.put("versionCode", code(info));
            call.resolve(result);
        } catch (Exception error) { call.reject("Installed version unavailable", error); }
    }

    static boolean acceptedCandidate(String packageName, long candidateCode, long installedCode,
                                     String actualDigest, String expectedDigest, String signerDigest) {
        return PACKAGE_ID.equals(packageName) && candidateCode > installedCode
            && (expectedDigest == null || expectedDigest.isEmpty() || expectedDigest.equalsIgnoreCase(actualDigest))
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

    static Signature[] signatures(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= 28) return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        return info.signatures;
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String source = call.getString("url", "");
        String expectedDigest = call.getString("sha256", "").replaceFirst("(?i)^sha256:", "");
        if (!source.matches("https://github\\.com/dedtsss/distance-points-on-the-map/releases/download/[^?#]+\\.apk")
            || (!expectedDigest.isEmpty() && !expectedDigest.matches("(?i)[0-9a-f]{64}"))) {
            call.reject("Invalid public DarkFoto release URL or digest");
            return;
        }
        new Thread(() -> {
            File target = new File(getContext().getCacheDir(), "darkfoto-update.apk");
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(60000);
                connection.setInstanceFollowRedirects(true);
                if (connection.getResponseCode() != 200 || !"https".equals(connection.getURL().getProtocol()))
                    throw new IllegalArgumentException("Release download unavailable");
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                long size = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[64 * 1024];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        size += count;
                        if (size > MAX_APK_BYTES) throw new IllegalArgumentException("APK exceeds 100 MiB");
                        sha.update(buffer, 0, count);
                        output.write(buffer, 0, count);
                    }
                } finally { connection.disconnect(); }
                if (size == 0) throw new IllegalArgumentException("Empty APK");
                PackageManager manager = getContext().getPackageManager();
                int signatureFlag = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
                PackageInfo candidate = manager.getPackageArchiveInfo(target.getAbsolutePath(), signatureFlag);
                PackageInfo installed = manager.getPackageInfo(PACKAGE_ID, 0);
                Signature[] signers = candidate == null ? null : signatures(candidate);
                if (signers == null || signers.length != 1)
                    throw new IllegalArgumentException("APK signing certificate unavailable");
                Signature signer = signers[0];
                String signerDigest = hex(MessageDigest.getInstance("SHA-256").digest(signer.toByteArray()));
                String actualDigest = hex(sha.digest());
                if (!acceptedCandidate(candidate.packageName, code(candidate), code(installed),
                                       actualDigest, expectedDigest, signerDigest))
                    throw new IllegalArgumentException("APK package, version, digest or signer verification failed");
                if (Build.VERSION.SDK_INT >= 26 && !manager.canRequestPackageInstalls()) {
                    Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + PACKAGE_ID));
                    settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settings);
                    JSObject result = new JSObject();
                    result.put("verified", true);
                    result.put("permissionRequired", true);
                    call.resolve(result);
                    return;
                }
                Uri uri = FileProvider.getUriForFile(getContext(), PACKAGE_ID + ".fileprovider", target);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("verified", true);
                result.put("versionCode", code(candidate));
                call.resolve(result);
            } catch (Exception error) {
                target.delete();
                call.reject("Update rejected: " + error.getMessage(), error);
            }
        }, "darkfoto-update").start();
    }
}
