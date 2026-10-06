package app.darkfoto.mvp;

import static org.junit.Assert.*;
import org.junit.Test;

public class UpdateVerificationTest {
    private static final String DIGEST = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    @Test public void onlyIncrementingSamePackageDigestAndPermanentSignerAreAccepted() {
        String signer = DarkFotoUpdatePlugin.SIGNER_SHA256;
        assertTrue(DarkFotoUpdatePlugin.acceptedCandidate("app.darkfoto.mvp", 4, 3, DIGEST, DIGEST, signer));
        assertFalse(DarkFotoUpdatePlugin.acceptedCandidate("other.package", 4, 3, DIGEST, DIGEST, signer));
        assertFalse(DarkFotoUpdatePlugin.acceptedCandidate("app.darkfoto.mvp", 3, 3, DIGEST, DIGEST, signer));
        assertFalse(DarkFotoUpdatePlugin.acceptedCandidate("app.darkfoto.mvp", 4, 3, DIGEST, "bbbb", signer));
        assertFalse(DarkFotoUpdatePlugin.acceptedCandidate("app.darkfoto.mvp", 4, 3, DIGEST, "", signer));
        assertFalse(DarkFotoUpdatePlugin.acceptedCandidate("app.darkfoto.mvp", 4, 3, DIGEST, DIGEST, "bbbb"));
    }
}
