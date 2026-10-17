package app.darkfoto.mvp;

import static org.junit.Assert.*;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.InputStream;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PhotoIngestionTest {
    @Test
    public void realJpegCopiesThroughNativeBoundaryAndDecodes() throws Exception {
        File target = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(), "ingestion-test.jpg");
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("black-bottom-right-overlay-crop.jpg")) {
            assertEquals(187439, DarkFotoFolderPlugin.copyPhoto(input, target));
        }
        Bitmap bitmap = BitmapFactory.decodeFile(target.getAbsolutePath());
        assertNotNull(bitmap);
        assertEquals(960, bitmap.getWidth());
        assertEquals(1280, bitmap.getHeight());
        bitmap.recycle();
        target.delete();
    }
}
