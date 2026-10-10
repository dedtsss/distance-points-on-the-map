package app.darkfoto.mvp;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DarkFotoSessionExport")
public class DarkFotoSessionExportPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private Job job;
    private static final class Job {
        final String token = UUID.randomUUID().toString();
        final Map<String, File> files = new LinkedHashMap<>();
        final Uri tree; final File cache; final String name; final int expected;
        Job(Uri tree, File cache, String name, int expected) {
            this.tree = tree; this.cache = cache; this.name = name; this.expected = expected;
        }
    }
    private File stagingRoot() { return new File(getContext().getCacheDir(), "darkcat-export"); }
    private static void removeCache(File directory) {
        File[] children = directory.listFiles();
        if (children != null) for (File child : children) {
            if (child.isDirectory()) removeCache(child); else child.delete();
        }
        directory.delete();
    }
    @Override public void load() { removeCache(stagingRoot()); }

    @PluginMethod public synchronized void begin(PluginCall call) {
        if (job != null) { call.reject("Экспорт уже выполняется"); return; }
        String name = call.getString("sessionName", "");
        int expected = call.getInt("expectedFiles", 0);
        if (name.isEmpty() || name.length() > 64 || name.matches(".*[\\\\/:*?\"<>|\\p{Cntrl}].*")
            || name.startsWith(".") || expected < 2 || expected > 200) { call.reject("Недопустимая сессия экспорта"); return; }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        startActivityForResult(call, intent, "destinationPicked");
    }
    @ActivityCallback private synchronized void destinationPicked(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Экспорт отменён: папка не выбрана"); return;
        }
        try {
            Uri tree = result.getData().getData();
            Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            try (Cursor cursor = getContext().getContentResolver().query(root,
                new String[]{DocumentsContract.Document.COLUMN_FLAGS}, null, null, null)) {
                if (cursor == null || !cursor.moveToFirst()
                    || (cursor.getInt(0) & DocumentsContract.Document.FLAG_DIR_SUPPORTS_CREATE) == 0)
                    throw new IllegalStateException("Выбранная папка не поддерживает запись");
            }
            File cache = new File(stagingRoot(), UUID.randomUUID().toString());
            if (!cache.mkdirs()) throw new IllegalStateException("Нет места для подготовки экспорта");
            job = new Job(tree, cache, call.getString("sessionName"), call.getInt("expectedFiles", 0));
            JSObject output = new JSObject(); output.put("token", job.token); call.resolve(output);
        } catch (Exception error) { call.reject("Не удалось открыть папку экспорта: " + error.getMessage(), error); }
    }
    private synchronized Job requireJob(PluginCall call) {
        if (job == null || !job.token.equals(call.getString("token"))) throw new IllegalStateException("Сессия экспорта истекла");
        return job;
    }
    @PluginMethod public void stage(PluginCall call) {
        executor.execute(() -> {
            try {
                Job current = requireJob(call);
                String path = call.getString("path"), mime = call.getString("mime"), data = call.getString("data");
                SessionFolderWriter.validatePath(path, mime);
                if (current.files.size() >= current.expected || current.files.containsKey(path)
                    || data == null || data.length() > 36 * 1024 * 1024) throw new IllegalArgumentException("Недопустимый файл экспорта");
                byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
                if (bytes.length == 0 || bytes.length > 25 * 1024 * 1024) throw new IllegalArgumentException("Недопустимый размер копии");
                File file = new File(current.cache, UUID.randomUUID().toString());
                try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
                current.files.put(path, file); call.resolve();
            } catch (Exception error) { call.reject("Подготовка экспорта: " + error.getMessage(), error); }
        });
    }
    SessionFolderWriter.Documents documents() {
        return new SessionFolderWriter.Documents() {
            public boolean exists(String parent, String name) throws Exception {
                Uri uri = Uri.parse(parent);
                Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(uri, DocumentsContract.getDocumentId(uri));
                try (Cursor cursor = getContext().getContentResolver().query(children,
                    new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                    if (cursor == null) throw new IllegalStateException("Папка недоступна");
                    while (cursor.moveToNext()) if (name.equalsIgnoreCase(cursor.getString(0))) return true;
                    return false;
                }
            }
            public String create(String parent, String name, String mime) throws Exception {
                Uri uri = DocumentsContract.createDocument(getContext().getContentResolver(), Uri.parse(parent), mime, name);
                return uri == null ? null : uri.toString();
            }
            public String name(String uri) throws Exception {
                try (Cursor cursor = getContext().getContentResolver().query(Uri.parse(uri),
                    new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                    if (cursor == null || !cursor.moveToFirst()) throw new IllegalStateException("Документ недоступен");
                    return cursor.getString(0);
                }
            }
            public OutputStream output(String uri) throws Exception { return getContext().getContentResolver().openOutputStream(Uri.parse(uri), "w"); }
            public InputStream input(String uri) throws Exception { return getContext().getContentResolver().openInputStream(Uri.parse(uri)); }
            public String rename(String uri, String name) throws Exception {
                Uri renamed = DocumentsContract.renameDocument(getContext().getContentResolver(), Uri.parse(uri), name);
                return renamed == null ? null : renamed.toString();
            }
            public boolean delete(String uri) throws Exception { return DocumentsContract.deleteDocument(getContext().getContentResolver(), Uri.parse(uri)); }
        };
    }
    @PluginMethod public void commit(PluginCall call) {
        executor.execute(() -> {
            Job current = null;
            try {
                current = requireJob(call);
                Uri root = DocumentsContract.buildDocumentUriUsingTree(current.tree, DocumentsContract.getTreeDocumentId(current.tree));
                String directory = SessionFolderWriter.write(documents(), root.toString(), current.name, current.files, current.expected);
                JSObject output = new JSObject(); output.put("directory", directory); output.put("files", current.files.size()); call.resolve(output);
            } catch (Exception error) { call.reject(error.getMessage(), error); }
            finally { if (current != null) clearJob(current); }
        });
    }
    private synchronized void clearJob(Job current) { removeCache(current.cache); if (job == current) job = null; }
    @PluginMethod public void abort(PluginCall call) {
        executor.execute(() -> {
            synchronized (this) { if (job != null && job.token.equals(call.getString("token"))) clearJob(job); }
            call.resolve();
        });
    }
    @Override protected void handleOnDestroy() { executor.shutdown(); super.handleOnDestroy(); }
}
