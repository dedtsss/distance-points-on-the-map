package app.darkfoto.mvp;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "DarkFotoText")
public class DarkFotoTextPlugin extends Plugin {
    private static final int MAX_CHARS = 500_000;

    static void writeUtf8(OutputStream output, String content) throws Exception {
        output.write(content.getBytes(StandardCharsets.UTF_8));
        output.flush();
    }

    private String content(PluginCall call) {
        String value = call.getString("text");
        if (value == null || value.length() > MAX_CHARS) throw new IllegalArgumentException("TXT size invalid");
        return value;
    }

    @PluginMethod
    public void saveText(PluginCall call) {
        try {
            content(call);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_TITLE, "darkfoto-result.txt");
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
    public void shareText(PluginCall call) {
        try {
            File directory = new File(getContext().getCacheDir(), "darkfoto-share");
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("TXT cache unavailable");
            File file = new File(directory, "darkfoto-result.txt");
            try (OutputStream output = new FileOutputStream(file)) { writeUtf8(output, content(call)); }
            Uri uri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newUri(getContext().getContentResolver(), "DarkFoto TXT", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(call, Intent.createChooser(send, "Поделиться TXT"), "textShared");
        } catch (Exception error) { call.reject("TXT share failed", error); }
    }

    @ActivityCallback
    private void textShared(PluginCall call, androidx.activity.result.ActivityResult result) { call.resolve(); }

    @Override
    protected void handleOnDestroy() {
        File file = new File(new File(getContext().getCacheDir(), "darkfoto-share"), "darkfoto-result.txt");
        file.delete();
        super.handleOnDestroy();
    }
}
