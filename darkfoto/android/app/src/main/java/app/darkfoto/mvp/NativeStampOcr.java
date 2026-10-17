package app.darkfoto.mvp;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.SystemClock;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.tasks.Task;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;

/** One bounded, offline OCR pass over the camera stamp. No full JPEG crosses the bridge. */
final class NativeStampOcr {
    private final TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);

    private Bitmap decode(Context context, Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(stream, null, bounds);
        }
        if (bounds.outWidth < 1 || bounds.outHeight < 1) throw new IllegalArgumentException("Invalid JPEG");
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 2560) options.inSampleSize *= 2;
        Bitmap bitmap;
        try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
            bitmap = BitmapFactory.decodeStream(stream, null, options);
        }
        if (bitmap == null) throw new IllegalArgumentException("JPEG decode failed");
        int orientation;
        try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
            orientation = new ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        }
        Matrix transform = new Matrix();
        if (orientation == ExifInterface.ORIENTATION_ROTATE_90) transform.postRotate(90);
        else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) transform.postRotate(180);
        else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) transform.postRotate(270);
        else if (orientation == ExifInterface.ORIENTATION_FLIP_HORIZONTAL) transform.postScale(-1, 1);
        else if (orientation == ExifInterface.ORIENTATION_FLIP_VERTICAL) transform.postScale(1, -1);
        else if (orientation == ExifInterface.ORIENTATION_TRANSPOSE) {
            transform.postRotate(90);
            transform.postScale(-1, 1);
        } else if (orientation == ExifInterface.ORIENTATION_TRANSVERSE) {
            transform.postRotate(90);
            transform.postScale(1, -1);
        }
        if (!transform.isIdentity()) {
            Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), transform, true);
            bitmap.recycle();
            return rotated;
        }
        return bitmap;
    }

    static boolean blackProfile(Bitmap bitmap) {
        int x = Math.min(bitmap.getWidth() - 1, Math.round(bitmap.getWidth() * .96f));
        int y = Math.min(bitmap.getHeight() - 1, Math.round(bitmap.getHeight() * .94f));
        int color = bitmap.getPixel(x, y);
        return ((color >> 16 & 255) + (color >> 8 & 255) + (color & 255)) / 3 < 90;
    }

    JSObject recognize(Context context, Uri uri, boolean alternate) throws Exception {
        long started = SystemClock.elapsedRealtime();
        Bitmap image = decode(context, uri);
        Bitmap prepared = null;
        Task<Text> task = null;
        boolean recognitionPending = false;
        try {
            boolean black = blackProfile(image);
            if (alternate) black = !black;
            // The two known camera formats use a right black stamp or a full-width gray caption.
            int x = black ? Math.round(image.getWidth() * .64f) : 0;
            int y = Math.round(image.getHeight() * (black ? .86f : .88f));
            int width = image.getWidth() - x;
            int height = image.getHeight() - y;
            Bitmap crop = Bitmap.createBitmap(image, x, y, width, height);
            int targetWidth = black ? 960 : 1280;
            prepared = Bitmap.createScaledBitmap(crop, targetWidth,
                Math.max(1, Math.round((float) height * targetWidth / width)), false);
            crop.recycle();
            Text result = null;
            String ocrError = "";
            try {
                task = recognizer.process(InputImage.fromBitmap(prepared, 0));
                result = Tasks.await(task, alternate ? 2 : 5, TimeUnit.SECONDS);
            } catch (Exception error) {
                ocrError = error.getClass().getSimpleName();
                recognitionPending = task != null && !task.isComplete();
            }
            JSArray lines = new JSArray();
            for (Text.TextBlock block : result == null ? java.util.Collections.<Text.TextBlock>emptyList() : result.getTextBlocks()) {
                for (Text.Line line : block.getLines()) {
                    JSObject item = new JSObject();
                    item.put("text", line.getText());
                    Rect box = line.getBoundingBox();
                    item.put("topRatio", box == null ? 0 : (double) box.top / prepared.getHeight());
                    lines.put(item);
                }
            }
            JSObject output = new JSObject();
            output.put("profile", black ? "black" : "gray");
            output.put("text", result == null ? "" : result.getText());
            output.put("ocrError", ocrError);
            output.put("lines", lines);
            output.put("elapsedMs", SystemClock.elapsedRealtime() - started);
            // Only the small prepared ROI is available to the strictly bounded fallback.
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            prepared.compress(Bitmap.CompressFormat.JPEG, 85, bytes);
            output.put("roi", "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
            return output;
        } finally {
            if (prepared != null) {
                if (recognitionPending && task != null) {
                    Bitmap release = prepared;
                    task.addOnCompleteListener(ignored -> release.recycle());
                } else prepared.recycle();
            }
            image.recycle();
        }
    }

    void close() { recognizer.close(); }
}
