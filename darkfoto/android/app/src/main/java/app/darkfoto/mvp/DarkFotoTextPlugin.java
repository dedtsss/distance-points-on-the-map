package app.darkfoto.mvp;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "DarkFotoText")
public class DarkFotoTextPlugin extends Plugin {
    private static final int MAX_CHARS = 500_000;
    private static final String GPX_MIME = "application/gpx+xml";
    private final AtomicBoolean copyActive = new AtomicBoolean(false);

    static void writeUtf8(OutputStream output, String content) throws Exception {
        output.write(content.getBytes(StandardCharsets.UTF_8));
        output.flush();
    }

    private String content(PluginCall call) {
        String value = call.getString("text");
        if (value == null || value.length() > MAX_CHARS) throw new IllegalArgumentException("Export size invalid");
        return value;
    }

    static String safeFilename(String value) {
        return safeFilename(value, ".txt");
    }

    static String safeFilename(String value, String extension) {
        String name = value == null ? "" : value.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_")
            .replaceAll("\\s+", "_")
            .replaceAll("_+", "_")
            .replaceAll("^[._ ]+|[._ ]+$", "");
        if (name.isEmpty()) name = "DarkFotoResult";
        if (name.length() > 120) name = name.substring(0, 120);
        if (!name.toLowerCase(Locale.ROOT).endsWith(extension)) name += extension;
        return name;
    }

    @PluginMethod
    public void copyText(PluginCall call) {
        try {
            ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard == null) throw new IllegalStateException("Clipboard unavailable");
            clipboard.setPrimaryClip(ClipData.newPlainText("DarkFoto TXT", content(call)));
            call.resolve();
        } catch (Exception error) { call.reject("TXT copy failed", error); }
    }

    @PluginMethod
    public void copyBlocks(PluginCall call) {
        if (!copyActive.compareAndSet(false, true)) { call.reject("Copy already running"); return; }
        try {
            JSArray input = call.getArray("blocks");
            if (input == null || input.length() < 1 || input.length() > 100)
                throw new IllegalArgumentException("Block count invalid");
            List<String> blocks = new ArrayList<>();
            for (int index = 0; index < input.length(); index++) {
                String block = input.getString(index);
                if (block == null || block.trim().isEmpty() || block.length() > 10_000)
                    throw new IllegalArgumentException("Block size invalid");
                blocks.add(block);
            }
            ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard == null) throw new IllegalStateException("Clipboard unavailable");
            Handler handler = new Handler(Looper.getMainLooper());
            handler.post(() -> ClipboardSequence.start(blocks, 220,
                (block, count) -> {
                    clipboard.setPrimaryClip(ClipData.newPlainText("DarkFoto #" + count, block));
                    JSObject progress = new JSObject();
                    progress.put("count", count);
                    progress.put("total", blocks.size());
                    notifyListeners("copyProgress", progress);
                }, (delay, next) -> handler.postDelayed(next, delay),
                () -> {
                    copyActive.set(false);
                    JSObject result = new JSObject();
                    result.put("count", blocks.size());
                    call.resolve(result);
                },
                error -> { copyActive.set(false); call.reject("Block copy failed", error); }));
        } catch (Exception error) { copyActive.set(false); call.reject("Block copy failed", error); }
    }

    @PluginMethod
    public void saveText(PluginCall call) {
        try {
            content(call);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_TITLE, safeFilename(call.getString("filename")));
            startActivityForResult(call, intent, "documentCreated");
        } catch (Exception error) { call.reject("TXT cannot be saved", error); }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null
            || result.getData().getData() == null) { call.reject("TXT save cancelled"); return; }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(result.getData().getData(), "w")) {
            if (output == null) throw new IllegalStateException("TXT destination unavailable");
            writeUtf8(output, content(call));
            call.resolve();
        } catch (Exception error) { call.reject("TXT write failed", error); }
    }

    @PluginMethod
    public void saveGpx(PluginCall call) {
        try {
            content(call);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(GPX_MIME);
            intent.putExtra(Intent.EXTRA_TITLE, safeFilename(call.getString("filename"), ".gpx"));
            startActivityForResult(call, intent, "gpxDocumentCreated");
        } catch (Exception error) { call.reject("GPX cannot be saved", error); }
    }

    @ActivityCallback
    private void gpxDocumentCreated(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null
            || result.getData().getData() == null) { call.reject("GPX save cancelled"); return; }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(result.getData().getData(), "w")) {
            if (output == null) throw new IllegalStateException("GPX destination unavailable");
            writeUtf8(output, content(call));
            call.resolve();
        } catch (Exception error) { call.reject("GPX write failed", error); }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        shareFile(call, "text/plain", ".txt", "DarkFoto TXT", "textShared");
    }

    @PluginMethod
    public void shareGpx(PluginCall call) {
        shareFile(call, GPX_MIME, ".gpx", "DarkFoto GPX", "gpxShared");
    }

    private void shareFile(PluginCall call, String mime, String extension, String label, String callback) {
        try {
            File directory = new File(getContext().getCacheDir(), "darkfoto-share");
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Share cache unavailable");
            File file = new File(directory, safeFilename(call.getString("filename"), extension));
            try (OutputStream output = new FileOutputStream(file)) { writeUtf8(output, content(call)); }
            Uri uri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newUri(getContext().getContentResolver(), label, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(call, Intent.createChooser(send, label), callback);
        } catch (Exception error) { call.reject("Share failed", error); }
    }

    @ActivityCallback
    private void textShared(PluginCall call, androidx.activity.result.ActivityResult result) { call.resolve(); }

    @ActivityCallback
    private void gpxShared(PluginCall call, androidx.activity.result.ActivityResult result) { call.resolve(); }

    @Override
    protected void handleOnDestroy() {
        File directory = new File(getContext().getCacheDir(), "darkfoto-share");
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) file.delete();
        super.handleOnDestroy();
    }
}
