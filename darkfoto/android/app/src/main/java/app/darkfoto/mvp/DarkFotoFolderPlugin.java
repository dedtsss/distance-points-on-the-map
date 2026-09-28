package app.darkfoto.mvp;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name = "DarkFotoFolder")
public class DarkFotoFolderPlugin extends Plugin {
    private static final int MAX_PHOTOS = 100;
    private static final int MAX_BYTES = 25 * 1024 * 1024;
    private final Map<String, Uri> selected = new HashMap<>();

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "folderPicked");
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
        Uri uri = selected.get(call.getString("id"));
        if (uri == null) { call.reject("Photo selection expired"); return; }
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) { call.reject("Photo cannot be read"); return; }
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > MAX_BYTES) { call.reject("Photo exceeds 25 MiB"); return; }
                output.write(buffer, 0, count);
            }
            JSObject data = new JSObject();
            data.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            call.resolve(data);
        } catch (Exception error) {
            call.reject("Photo read failed", error);
        }
    }
}
