package app.darkfoto.mvp;

import static org.junit.Assert.*;
import android.app.DownloadManager;
import org.junit.Test;

public class UpdateDownloadStateTest {
    @Test public void mapsDownloadManagerStates() {
        assertEquals("downloading", UpdateDownloadState.map(DownloadManager.STATUS_PENDING));
        assertEquals("downloading", UpdateDownloadState.map(DownloadManager.STATUS_RUNNING));
        assertEquals("paused", UpdateDownloadState.map(DownloadManager.STATUS_PAUSED));
        assertEquals("completed", UpdateDownloadState.map(DownloadManager.STATUS_SUCCESSFUL));
        assertEquals("failed", UpdateDownloadState.map(DownloadManager.STATUS_FAILED));
    }

    @Test public void fractionIsBoundedAndUnknownSizeIsIndeterminate() {
        assertEquals(-1, UpdateDownloadState.fraction(25, -1), 0);
        assertEquals(0.25, UpdateDownloadState.fraction(25, 100), 0);
        assertEquals(1, UpdateDownloadState.fraction(125, 100), 0);
        assertEquals(0, UpdateDownloadState.fraction(-1, 100), 0);
    }

    @Test public void candidateIdentityIncludesVersionUrlAndDigest() {
        String digest = "a".repeat(64);
        assertTrue(UpdateDownloadState.sameCandidate("0.3.5", "https://example/a.apk", digest,
            "0.3.5", "https://example/a.apk", digest.toUpperCase()));
        assertFalse(UpdateDownloadState.sameCandidate("0.3.6", "https://example/a.apk", digest,
            "0.3.5", "https://example/a.apk", digest));
        assertFalse(UpdateDownloadState.sameCandidate("0.3.5", "https://example/b.apk", digest,
            "0.3.5", "https://example/a.apk", digest));
        assertFalse(UpdateDownloadState.sameCandidate("0.3.5", "https://example/a.apk", "b".repeat(64),
            "0.3.5", "https://example/a.apk", digest));
    }

    @Test public void persistedDownloadIdResumesAndVerifiedFileSurvivesPermissionRoundtrip() {
        long recoveredId = 42;
        assertFalse(UpdateDownloadState.shouldEnqueue(recoveredId, "downloading"));
        assertFalse(UpdateDownloadState.shouldEnqueue(recoveredId, "paused"));
        assertFalse(UpdateDownloadState.shouldEnqueue(recoveredId, "ready_to_install"));
        assertEquals("permission_required", UpdateDownloadState.verifiedState(true, false));
        assertEquals("ready_to_install", UpdateDownloadState.verifiedState(true, true));
        assertEquals("failed", UpdateDownloadState.verifiedState(false, true));
        assertFalse(UpdateDownloadState.shouldEnqueue(recoveredId,
            UpdateDownloadState.verifiedState(true, true)));
        assertTrue(UpdateDownloadState.shouldEnqueue(recoveredId, "failed"));
        assertTrue(UpdateDownloadState.shouldEnqueue(-1, "idle"));
    }
}
