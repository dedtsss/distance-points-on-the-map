package app.darkfoto.mvp;

import static org.junit.Assert.*;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class MlKitComparisonTest {
    @Test
    public void measureBundledLatinOnSameRealJpegCrops() throws Exception {
        String[] names = { "black-bottom-right-overlay-crop.jpg", "gray-bottom-caption-overlay-crop.jpg" };
        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        try {
            for (String name : names) {
                Bitmap full;
                try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name)) {
                    full = BitmapFactory.decodeStream(input);
                }
                assertNotNull(full);
                int y = name.startsWith("black") ? 1110 : 1130;
                int x = name.startsWith("black") ? 640 : 0;
                int width = name.startsWith("black") ? 320 : 960;
                Bitmap crop = Bitmap.createBitmap(full, x, y, width, full.getHeight() - y);
                Bitmap prepared = Bitmap.createScaledBitmap(crop, width * 3, crop.getHeight() * 3, false);
                long started = System.currentTimeMillis();
                Text text = Tasks.await(recognizer.process(InputImage.fromBitmap(prepared, 0)), 60, TimeUnit.SECONDS);
                String result = text.getText().replace('\n', ' ').trim();
                Log.i("DarkFotoMLKit", name + " timeMs=" + (System.currentTimeMillis() - started) + " text=" + result);
                assertFalse("Bundled ML Kit returned no text for " + name, result.isEmpty());
                prepared.recycle(); crop.recycle(); full.recycle();
            }
        } finally { recognizer.close(); }
    }
}
