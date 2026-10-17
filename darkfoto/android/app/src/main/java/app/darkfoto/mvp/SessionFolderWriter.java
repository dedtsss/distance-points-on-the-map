package app.darkfoto.mvp;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Writes a new tree only. No source or existing destination document is edited. */
final class SessionFolderWriter {
    interface Documents {
        boolean exists(String parent, String name) throws Exception;
        String create(String parent, String name, String mime) throws Exception;
        String name(String uri) throws Exception;
        OutputStream output(String uri) throws Exception;
        InputStream input(String uri) throws Exception;
        String rename(String uri, String name) throws Exception;
        boolean delete(String uri) throws Exception;
    }
    static final String DIRECTORY = "vnd.android.document/directory";

    static void validatePath(String path, String mime) {
        if (path == null || path.length() > 160) throw new IllegalArgumentException("Недопустимое имя файла");
        String[] parts = path.split("/", -1);
        if (parts.length != 2 || !parts[0].matches("[\\p{L}\\p{N}_-]{1,70}"))
            throw new IllegalArgumentException("Недопустимая папка точки");
        String prefix = java.util.regex.Pattern.quote(parts[0]);
        boolean jpeg = "image/jpeg".equals(mime) && parts[1].matches(prefix + "-[0-9]{2,3}\\.jpg");
        boolean text = "text/plain".equals(mime) && parts[1].equals(parts[0] + ".txt");
        if (!jpeg && !text) throw new IllegalArgumentException("Недопустимый файл экспорта");
    }

    static byte[] digest(InputStream input) throws Exception {
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024]; int count;
        while ((count = input.read(buffer)) != -1) hash.update(buffer, 0, count);
        return hash.digest();
    }

    static void validateComplete(Map<String, File> files, int expected) {
        if (files.size() != expected || expected < 2 || expected > 200)
            throw new IllegalArgumentException("Экспорт подготовлен не полностью");
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String path : files.keySet()) {
            String directory = path.split("/")[0];
            counts.putIfAbsent(directory, 0);
            if (path.endsWith(".jpg")) counts.put(directory, counts.get(directory) + 1);
        }
        for (Map.Entry<String, Integer> entry : counts.entrySet()) {
            String directory = entry.getKey(); int count = entry.getValue();
            if (count < 1 || !files.containsKey(directory + "/" + directory + ".txt"))
                throw new IllegalArgumentException("Нет TXT или фото точки");
            for (int index = 1; index <= count; index++) {
                String filename = directory + "/" + directory + "-" + String.format(java.util.Locale.ROOT, "%02d", index) + ".jpg";
                if (!files.containsKey(filename)) throw new IllegalArgumentException("Нарушена нумерация фото");
            }
        }
    }

    static String write(Documents documents, String parent, String session, Map<String, File> files, int expected) throws Exception {
        validateComplete(files, expected);
        String destination = session; int suffix = 2;
        while (documents.exists(parent, destination)) destination = session + "-" + suffix++;
        String pendingName = destination + ".incomplete-" + UUID.randomUUID().toString().substring(0, 8);
        String root = null;
        try {
            root = documents.create(parent, pendingName, DIRECTORY);
            if (root == null || !pendingName.equals(documents.name(root))) throw new IOException("Папка не создана с ожидаемым именем");
            Map<String, String> directories = new LinkedHashMap<>();
            for (Map.Entry<String, File> entry : files.entrySet()) {
                String[] parts = entry.getKey().split("/");
                String directory = directories.get(parts[0]);
                if (directory == null) {
                    directory = documents.create(root, parts[0], DIRECTORY);
                    if (directory == null || !parts[0].equals(documents.name(directory))) throw new IOException("Неверное имя папки точки");
                    directories.put(parts[0], directory);
                }
                String uri = documents.create(directory, parts[1], parts[1].endsWith(".jpg") ? "image/jpeg" : "text/plain");
                if (uri == null || !parts[1].equals(documents.name(uri))) throw new IOException("Неверное имя файла");
                try (InputStream input = new FileInputStream(entry.getValue()); OutputStream output = documents.output(uri)) {
                    if (output == null) throw new IOException("Нет доступа к записи");
                    byte[] buffer = new byte[64 * 1024]; int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    output.flush();
                }
                try (InputStream source = new FileInputStream(entry.getValue()); InputStream saved = documents.input(uri)) {
                    if (saved == null || !Arrays.equals(digest(source), digest(saved))) throw new IOException("Проверка записанного файла не пройдена");
                }
            }
            String renamed = documents.rename(root, destination);
            if (renamed == null) throw new IOException("Не удалось завершить папку сессии");
            root = renamed;
            if (!destination.equals(documents.name(root))) throw new IOException("Неверное имя сессии");
            return destination;
        } catch (Exception error) {
            boolean deleted = root == null;
            try { if (root != null) deleted = documents.delete(root); } catch (Exception ignored) { }
            throw new IOException("Экспорт не завершён. " + (deleted ? "Неполная копия удалена."
                : "Не удалось удалить неполную папку: " + pendingName + ". Удалите её вручную.") + " " + error.getMessage(), error);
        }
    }
}
