package app.darkfoto.mvp;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class DarkFotoTextPluginTest {
    @Test
    public void sessionFilenameIsStableAndSafe() {
        assertEquals("DarkCatPhotoResult_17_Север.txt",
            DarkFotoTextPlugin.safeFilename("DarkCatPhotoResult_17 Север.txt"));
        assertEquals("DarkCatPhotoResult.txt", DarkFotoTextPlugin.safeFilename(""));
        assertEquals("DarkCatPhotoResult_Север_2.txt",
            DarkFotoTextPlugin.safeFilename("DarkCatPhotoResult_Север/2.txt"));
    }
}
