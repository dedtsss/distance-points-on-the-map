package app.darkfoto.mvp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class UpdaterApkVerifierTest {
    @Test
    public void apksigReadsInstalledApkCertificateOnAndroid() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        String sourceDir = context.getApplicationInfo().sourceDir;
        assertNotNull(sourceDir);
        String digest = DarkFotoUpdatePlugin.verifiedSignerDigest(new File(sourceDir));
        assertNotNull(digest);
        assertEquals(64, digest.length());
    }
}
