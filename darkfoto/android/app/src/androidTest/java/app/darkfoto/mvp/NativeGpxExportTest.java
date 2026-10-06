package app.darkfoto.mvp;

import static org.junit.Assert.*;

import android.content.Context;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeGpxExportTest {
    @Test
    public void gpxCanBeReadThroughExistingFileProvider() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(context.getCacheDir(), "darkfoto-share");
        assertTrue(directory.exists() || directory.mkdirs());
        File file = new File(directory, DarkFotoTextPlugin.safeFilename("DarkFotoResult_17.gpx", ".gpx"));
        String gpx = "<?xml version=\"1.0\"?><gpx><wpt lat=\"64.581207\" lon=\"30.597531\"><name>#6301 / 17</name></wpt></gpx>";
        try (FileOutputStream output = new FileOutputStream(file)) {
            DarkFotoTextPlugin.writeUtf8(output, gpx);
        }
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        try (var input = context.getContentResolver().openInputStream(uri)) {
            assertNotNull(input);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            assertEquals(gpx, bytes.toString(StandardCharsets.UTF_8.name()));
        }
        assertEquals("content", uri.getScheme());
        file.delete();
    }
}
