package app.darkfoto.mvp;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class SessionFolderWriterTest {
    private static class Documents implements SessionFolderWriter.Documents {
        final Map<String, byte[]> bytes = new HashMap<>();
        final Map<String, String> names = new HashMap<>();
        String fail = ""; boolean deleted, failDelete;
        public boolean exists(String parent, String name) { return name.equals("Север"); }
        public String create(String parent, String name, String mime) {
            String uri = parent + "/" + name; names.put(uri, name); return uri;
        }
        public String name(String uri) { return names.get(uri); }
        public OutputStream output(String uri) throws Exception {
            if (fail.equals("write")) throw new IOException("full");
            return new ByteArrayOutputStream() { public void close() { bytes.put(uri, toByteArray()); } };
        }
        public InputStream input(String uri) { return new ByteArrayInputStream(fail.equals("verify") ? new byte[]{0} : bytes.get(uri)); }
        public String rename(String uri, String name) throws Exception {
            if (fail.equals("rename")) throw new IOException("unsupported");
            names.put(uri, name); return uri;
        }
        public boolean delete(String uri) { deleted = !failDelete; return !failDelete; }
    }
    @Test public void completeFilesVerifyThenRenameWithoutOverwritingExistingSession() throws Exception {
        File jpeg = File.createTempFile("export", ".jpg"), txt = File.createTempFile("export", ".txt");
        try {
            try (FileOutputStream out = new FileOutputStream(jpeg)) { out.write(new byte[]{1,2,3}); }
            try (FileOutputStream out = new FileOutputStream(txt)) { out.write("Фото: 1\n6950-01.jpg\n".getBytes(StandardCharsets.UTF_8)); }
            Map<String, File> files = new LinkedHashMap<>(); files.put("6950/6950-01.jpg", jpeg); files.put("6950/6950.txt", txt);
            Documents docs = new Documents();
            assertEquals("Север-2", SessionFolderWriter.write(docs, "root", "Север", files, 2));
            assertEquals(2, docs.bytes.size()); assertFalse(docs.deleted);
            assertTrue(docs.names.containsValue("Север-2"));
            for (String failure : new String[]{"write", "verify", "rename"}) {
                docs = new Documents(); docs.fail = failure;
                try { SessionFolderWriter.write(docs, "root", "Север", files, 2); fail(); }
                catch (IOException error) { assertTrue(error.getMessage().contains("Экспорт не завершён")); }
                assertTrue(docs.deleted); assertFalse(docs.names.containsValue("Север-2"));
            }
            docs = new Documents(); docs.fail = "verify"; docs.failDelete = true;
            try { SessionFolderWriter.write(docs, "root", "Север", files, 2); fail(); }
            catch (IOException error) { assertTrue(error.getMessage().contains("Удалите её вручную")); assertTrue(error.getMessage().contains(".incomplete-")); }
            docs = new Documents();
            try { SessionFolderWriter.write(docs, "root", "Север", files, 3); fail(); }
            catch (IllegalArgumentException expected) { assertTrue(docs.names.isEmpty()); }
        } finally { jpeg.delete(); txt.delete(); }
    }
    @Test public void pathsRejectTraversalWrongMimeAndMissingPhotoSequence() {
        SessionFolderWriter.validatePath("6950/6950-01.jpg", "image/jpeg");
        SessionFolderWriter.validatePath("6950/6950.txt", "text/plain");
        for (String path : new String[]{"../secret.jpg", "6950/../6950.txt", "6950/wrong.jpg", "/6950/6950.txt"}) {
            try { SessionFolderWriter.validatePath(path, "image/jpeg"); fail(path); } catch (IllegalArgumentException expected) { }
        }
        Map<String, File> incomplete = new LinkedHashMap<>();
        incomplete.put("6950/6950-02.jpg", new File("unused")); incomplete.put("6950/6950.txt", new File("unused"));
        try { SessionFolderWriter.validateComplete(incomplete, 2); fail(); } catch (IllegalArgumentException expected) { }
    }
}
