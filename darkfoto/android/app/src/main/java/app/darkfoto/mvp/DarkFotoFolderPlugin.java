package app.darkfoto.mvp;

import android.app.Activity;
import android.content.ClipData;
import android.content.pm.ApplicationInfo;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DarkFotoFolder")
public class DarkFotoFolderPlugin extends Plugin {
    private static final int MAX_PHOTOS = 100;
    private static final int MAX_BYTES = 25 * 1024 * 1024;
    private final Map<String, Uri> selected = new HashMap<>();
    private final Map<String, File> cached = new HashMap<>();
    private final ExecutorService ocrExecutor = Executors.newSingleThreadExecutor();
    private NativeStampOcr stampOcr;

    private void clearCached() {
        for (File file : cached.values()) file.delete();
        cached.clear();
        File[] leftovers = new File(getContext().getCacheDir(), "darkfoto-selected").listFiles();
        if (leftovers != null) for (File file : leftovers) file.delete();
    }

    static long copyPhoto(InputStream input, File target) throws IOException {
        long size = 0;
        try (FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                size += count;
                if (size > MAX_BYTES) throw new IOException("Photo exceeds 25 MiB");
                output.write(buffer, 0, count);
            }
        }
        return size;
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "folderPicked");
    }

    @PluginMethod
    public void pickPhotos(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("image/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "photosPicked");
    }

    @ActivityCallback
    private void photosPicked(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Photo selection cancelled");
            return;
        }
        selected.clear();
        clearCached();
        ArrayList<Uri> uris = new ArrayList<>();
        ClipData clip = result.getData().getClipData();
        if (clip != null) {
            for (int index = 0; index < clip.getItemCount(); index++) uris.add(clip.getItemAt(index).getUri());
        } else if (result.getData().getData() != null) uris.add(result.getData().getData());
        if (uris.isEmpty() || uris.size() > MAX_PHOTOS) { call.reject("Choose 1 to 100 photos"); return; }
        JSArray files = new JSArray();
        try {
            for (Uri uri : uris) {
                String mime = getContext().getContentResolver().getType(uri);
                if (mime == null || !mime.startsWith("image/")) continue;
                String name = "photo.jpg";
                long size = -1;
                try (Cursor cursor = getContext().getContentResolver().query(uri,
                    new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        String displayName = cursor.getString(0);
                        if (displayName != null && !displayName.isEmpty()) name = displayName;
                        size = cursor.isNull(1) ? -1 : cursor.getLong(1);
                    }
                }
                if (size > MAX_BYTES) { call.reject("Photo exceeds 25 MiB"); return; }
                String id = UUID.randomUUID().toString();
                selected.put(id, uri);
                JSObject item = new JSObject();
                item.put("id", id);
                item.put("name", name);
                item.put("type", mime);
                item.put("size", size);
                files.put(item);
            }
            JSObject output = new JSObject();
            output.put("files", files);
            call.resolve(output);
        } catch (Exception error) { selected.clear(); call.reject("Photo selection failed", error); }
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Folder selection cancelled");
            return;
        }
        Uri tree = result.getData().getData();
        if (tree == null) { call.reject("Folder unavailable"); return; }
        selected.clear();
        clearCached();
        JSArray files = new JSArray();
        String treeId = DocumentsContract.getTreeDocumentId(tree);
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, treeId);
        String[] columns = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE
        };
        try (Cursor cursor = getContext().getContentResolver().query(children, columns, null, null, null)) {
            if (cursor == null) { call.reject("Folder cannot be read"); return; }
            while (cursor.moveToNext()) {
                String mime = cursor.getString(2);
                if (mime == null || !mime.startsWith("image/")) continue;
                if (files.length() >= MAX_PHOTOS) { call.reject("Folder exceeds 100 photos"); return; }
                long size = cursor.isNull(3) ? -1 : cursor.getLong(3);
                if (size > MAX_BYTES) { call.reject("Photo exceeds 25 MiB"); return; }
                String id = UUID.randomUUID().toString();
                Uri photo = DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0));
                selected.put(id, photo);
                JSObject item = new JSObject();
                item.put("id", id);
                item.put("name", cursor.getString(1));
                item.put("type", mime);
                item.put("size", size);
                files.put(item);
            }
            JSObject output = new JSObject();
            output.put("files", files);
            call.resolve(output);
        } catch (Exception error) {
            selected.clear();
            call.reject("Folder read failed", error);
        }
    }

    @PluginMethod
    public void readPhoto(PluginCall call) {
        String id = call.getString("id");
        Uri uri = selected.get(id);
        if (uri == null) { call.reject("Photo selection expired"); return; }
        File existing = cached.get(id);
        if (existing != null && existing.isFile() && existing.length() > 0 && existing.length() <= MAX_BYTES) {
            JSObject data = new JSObject();
            data.put("uri", Uri.fromFile(existing).toString());
            data.put("size", existing.length());
            call.resolve(data);
            return;
        }
        File directory = new File(getContext().getCacheDir(), "darkfoto-selected");
        if (!directory.exists() && !directory.mkdirs()) { call.reject("Photo cache unavailable"); return; }
        File target = new File(directory, id + ".jpg");
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) { call.reject("Photo cannot be read"); return; }
            long size = copyPhoto(input, target);
            cached.put(id, target);
            JSObject data = new JSObject();
            data.put("uri", Uri.fromFile(target).toString());
            data.put("size", size);
            call.resolve(data);
        } catch (Exception error) {
            target.delete();
            call.reject("Photo read failed", error);
        }
    }

    @PluginMethod
    public void recognizePhoto(PluginCall call) {
        Uri uri = selected.get(call.getString("id"));
        if (uri == null) { call.reject("Photo selection expired"); return; }
        boolean alternate = Boolean.TRUE.equals(call.getBoolean("alternate"));
        ocrExecutor.execute(() -> {
            try {
                if (stampOcr == null) stampOcr = new NativeStampOcr();
                call.resolve(stampOcr.recognize(getContext(), uri, alternate));
            } catch (Exception error) { call.reject("Native OCR failed", error); }
        });
    }

    @PluginMethod
    public void clearPhotoCache(PluginCall call) {
        clearCached();
        call.resolve();
    }

    // Available only in a debuggable APK used by the emulator acceptance test.
    @PluginMethod
    public void prepareTestPhotos(PluginCall call) {
        if ((getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            call.reject("Unavailable in release builds");
            return;
        }
        selected.clear();
        clearCached();
        JSArray files = new JSArray();
        String[] names = { "black-bottom-right-overlay-crop.jpg", "gray-bottom-caption-overlay-crop.jpg",
                           "representative-6300.jpg", "representative-6301.jpg", "representative-6302.jpg" };
        try {
            File directory = new File(getContext().getCacheDir(), "darkfoto-test-input");
            if (!directory.exists() && !directory.mkdirs()) throw new IOException("Test cache unavailable");
            for (int index = 0; index < names.length; index++) {
                String id = "test-" + index;
                File source = new File(directory, id + ".jpg");
                try (InputStream input = getContext().getAssets().open(names[index])) { copyPhoto(input, source); }
                selected.put(id, Uri.fromFile(source));
                JSObject item = new JSObject();
                item.put("id", id);
                item.put("name", names[index]);
                item.put("type", "image/jpeg");
                files.put(item);
            }
            JSObject result = new JSObject();
            result.put("files", files);
            call.resolve(result);
        } catch (Exception error) { call.reject("Test photo setup failed", error); }
    }

    @Override
    protected void handleOnDestroy() {
        clearCached();
        ocrExecutor.shutdownNow();
        if (stampOcr != null) stampOcr.close();
        super.handleOnDestroy();
    }
}
