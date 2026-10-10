package app.darkfoto.mvp;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DarkFotoFolderPlugin.class);
        registerPlugin(DarkFotoUpdatePlugin.class);
        registerPlugin(DarkFotoTextPlugin.class);
        registerPlugin(DarkFotoSessionExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
