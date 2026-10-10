package app.darkfoto.mvp;

import static org.junit.Assert.*;

import android.content.Context;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeTextExportTest {
    @Test
    public void utf8TxtCanBeSharedThroughFileProvider() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(context.getCacheDir(), "darkfoto-share");
        assertTrue(directory.exists() || directory.mkdirs());
        String filename = DarkFotoTextPlugin.safeFilename("17 Север");
        assertEquals("17_Север.txt", filename);
        assertEquals("DarkCatPhotoResult.txt", DarkFotoTextPlugin.safeFilename(""));
        File file = new File(directory, filename);
        String result = "Основные\n#6301\n64.581207, 30.597531\n";
        try (FileOutputStream output = new FileOutputStream(file)) {
            DarkFotoTextPlugin.writeUtf8(output, result);
        }
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (var input = context.getContentResolver().openInputStream(uri)) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
        }
        assertEquals(result, bytes.toString(StandardCharsets.UTF_8.name()));
        assertEquals("content", uri.getScheme());
        file.delete();
    }
}
