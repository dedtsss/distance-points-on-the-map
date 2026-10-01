package app.darkfoto.mvp;

import static org.junit.Assert.*;

import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidWebViewOcrTest {
    private String evaluate(MainActivity activity, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            activity.getBridge().getWebView().evaluateJavascript(script, result -> {
                value.set(result);
                latch.countDown();
            }));
        assertTrue("WebView callback timed out", latch.await(10, TimeUnit.SECONDS));
        return String.valueOf(new JSONTokener(value.get()).nextValue());
    }

    @Test
    public void nativeCacheToWebViewDecodeCropOcrAndThreePhotoSplit() throws Exception {
        Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity activity = (MainActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
        try {
            boolean ready = false;
            for (int attempt = 0; attempt < 20; attempt++) {
                if ("ready".equals(evaluate(activity, "typeof window.__darkfotoAndroidTest === 'function' ? 'ready' : 'waiting'"))) {
                    ready = true;
                    break;
                }
                Thread.sleep(500);
            }
            assertTrue("Android test harness did not load", ready);
            evaluate(activity, "window.__darkfotoAndroidTest().then(x => window.__darkfotoResult = JSON.stringify(x)).catch(e => window.__darkfotoResult = JSON.stringify({error:String(e)})); 'started'");
            String result = "";
            for (int attempt = 0; attempt < 180; attempt++) {
                result = evaluate(activity, "window.__darkfotoResult || ''");
                if (!result.isEmpty()) break;
                Thread.sleep(1000);
            }
            assertFalse("Android OCR timed out", result.isEmpty());
            JSONObject batch = new JSONObject(result);
            assertFalse(batch.optString("error"), batch.has("error"));
            JSONArray photos = batch.getJSONArray("photos");
            assertEquals(3, photos.length());
            assertEquals("5939", photos.getJSONObject(0).getString("index"));
            assertEquals(64.604344, photos.getJSONObject(0).getJSONObject("coordinates").getDouble("latitude"), 0.00001);
            assertEquals(30.591954, photos.getJSONObject(0).getJSONObject("coordinates").getDouble("longitude"), 0.00001);
            assertEquals(1, batch.getInt("main"));
            assertEquals(1, batch.getInt("reserve"));
            assertEquals(1, batch.getInt("unresolved"));
            assertEquals(0, batch.getInt("remainingConflicts"));
        } finally { activity.finish(); }
    }
}
