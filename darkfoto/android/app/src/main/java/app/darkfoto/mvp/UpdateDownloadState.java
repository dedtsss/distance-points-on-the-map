package app.darkfoto.mvp;

import android.app.DownloadManager;

final class UpdateDownloadState {
    private UpdateDownloadState() {}

    static String map(int status) {
        switch (status) {
            case DownloadManager.STATUS_PENDING:
            case DownloadManager.STATUS_RUNNING: return "downloading";
            case DownloadManager.STATUS_PAUSED: return "paused";
            case DownloadManager.STATUS_SUCCESSFUL: return "completed";
            case DownloadManager.STATUS_FAILED: return "failed";
            default: return "failed";
        }
    }

    static double fraction(long downloaded, long total) {
        if (total <= 0) return -1;
        return Math.max(0, Math.min(1, (double) downloaded / total));
    }

    static boolean sameCandidate(String version, String url, String digest,
                                 String oldVersion, String oldUrl, String oldDigest) {
        return version.equals(oldVersion) && url.equals(oldUrl) && digest.equalsIgnoreCase(oldDigest);
    }

    static boolean shouldEnqueue(long persistedId, String state) {
        return persistedId < 0 || "failed".equals(state);
    }

    static String verifiedState(boolean filePresent, boolean permissionAllowed) {
        if (!filePresent) return "failed";
        return permissionAllowed ? "ready_to_install" : "permission_required";
    }
}
