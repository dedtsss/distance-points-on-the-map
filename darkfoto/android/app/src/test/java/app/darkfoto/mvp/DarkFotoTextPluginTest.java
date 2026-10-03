package app.darkfoto.mvp;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class DarkFotoTextPluginTest {
    @Test
    public void sessionFilenameIsStableAndSafe() {
        assertEquals("DarkFotoResult_17_Север.txt",
            DarkFotoTextPlugin.safeFilename("DarkFotoResult_17 Север.txt"));
        assertEquals("DarkFotoResult.txt", DarkFotoTextPlugin.safeFilename(""));
        assertEquals("DarkFotoResult_Север_2.txt",
            DarkFotoTextPlugin.safeFilename("DarkFotoResult_Север/2.txt"));
    }
}
