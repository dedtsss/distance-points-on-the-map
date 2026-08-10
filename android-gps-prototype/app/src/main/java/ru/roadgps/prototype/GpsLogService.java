package ru.roadgps.prototype;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class GpsLogService extends Service {
    public static final String ACTION_START = "ru.roadgps.prototype.START";
    public static final String ACTION_STOP = "ru.roadgps.prototype.STOP";
    public static final String ACTION_STATUS = "ru.roadgps.prototype.STATUS";
    public static final String EXTRA_STATUS = "status";
    public static final String PREFS_NAME = "road_gps_logger";
    public static final String PREF_LATEST_CSV = "latest_csv";

    private static final String CHANNEL_ID = "road_gps_logger";
    private static final int NOTIFICATION_ID = 1001;
    private static final long LOCATION_INTERVAL_MS = 5_000L;
    private static final float LOCATION_MIN_DISTANCE_M = 0f;
    private static final int INTERNET_TIMEOUT_MS = 1_500;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService internetExecutor = Executors.newSingleThreadExecutor();

    private LocationManager locationManager;
    private BufferedWriter csvWriter;
    private File currentCsv;
    private boolean recording;
    private int pointCount;

    private final LocationListener locationListener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            recordLocation(location);
        }

        @Override
        public void onProviderEnabled(String provider) {
            sendStatus("Status: GPS provider enabled; recording " + pointCount + " points");
        }

        @Override
        public void onProviderDisabled(String provider) {
            sendStatus("Status: GPS provider disabled; recording is still active");
        }

        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {
            // Deprecated but still part of LocationListener on older Android APIs.
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopRecording();
            return START_NOT_STICKY;
        }

        startRecording();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopRecording();
        internetExecutor.shutdownNow();
        super.onDestroy();
    }

    private void startRecording() {
        if (recording) {
            sendStatus("Status: already recording " + pointCount + " points to " + currentCsv.getName());
            return;
        }

        if (!hasLocationPermission()) {
            sendStatus("Status: missing location permission");
            stopSelf();
            return;
        }

        try {
            currentCsv = createCsvFile();
            csvWriter = new BufferedWriter(new FileWriter(currentCsv, false));
            csvWriter.write("time,lat,lon,accuracy_m,altitude_m,speed_mps,bearing_deg,provider,internet_ok,internet_latency_ms\n");
            csvWriter.flush();
            persistLatestCsvIfPresent();
        } catch (IOException e) {
            sendStatus("Status: failed to create CSV: " + e.getMessage());
            stopSelf();
            return;
        }

        recording = true;
        pointCount = 0;
        startForeground(NOTIFICATION_ID, buildNotification("Recording GPS to " + currentCsv.getName()));
        requestLocationUpdates();
        sendStatus("Status: recording to " + currentCsv.getName());
    }

    private void stopRecording() {
        if (locationManager != null) {
            locationManager.removeUpdates(locationListener);
        }

        if (csvWriter != null) {
            try {
                csvWriter.flush();
                csvWriter.close();
            } catch (IOException ignored) {
                // Best effort close for a prototype logger.
            }
            csvWriter = null;
        }

        boolean wasRecording = recording;
        recording = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }

        if (wasRecording && currentCsv != null) {
            sendStatus("Status: stopped; saved " + pointCount + " points to " + currentCsv.getName());
        } else {
            sendStatus("Status: stopped");
        }
        stopSelf();
    }

    private void requestLocationUpdates() {
        boolean requestedProvider = requestProvider(LocationManager.GPS_PROVIDER);
        requestedProvider = requestProvider(LocationManager.NETWORK_PROVIDER) || requestedProvider;
        if (!requestedProvider) {
            sendStatus("Status: no enabled location provider; recording waits for GPS");
        }
    }

    private boolean requestProvider(String provider) {
        try {
            if (!locationManager.isProviderEnabled(provider)) {
                return false;
            }
            locationManager.requestLocationUpdates(
                    provider,
                    LOCATION_INTERVAL_MS,
                    LOCATION_MIN_DISTANCE_M,
                    locationListener,
                    Looper.getMainLooper());
            return true;
        } catch (SecurityException e) {
            sendStatus("Status: location permission denied while starting updates");
            return false;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private void recordLocation(Location location) {
        if (!recording || csvWriter == null || location == null) {
            return;
        }

        internetExecutor.execute(() -> {
            InternetProbeResult internet = checkInternetThroughActiveNetwork();
            mainHandler.post(() -> writeLocation(location, internet));
        });
    }

    private void writeLocation(Location location, InternetProbeResult internet) {
        if (!recording || csvWriter == null) {
            return;
        }

        try {
            csvWriter.write(csvLine(location, internet));
            csvWriter.newLine();
            csvWriter.flush();
            pointCount++;
            sendStatus("Status: recording " + pointCount + " points to " + currentCsv.getName()
                    + "; internet_ok=" + internet.internetOkInt + "; latency_ms=" + internet.latencyMs);
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            manager.notify(NOTIFICATION_ID, buildNotification("Recorded " + pointCount + " GPS points"));
        } catch (IOException e) {
            sendStatus("Status: failed writing CSV: " + e.getMessage());
        }
    }

    private String csvLine(Location location, InternetProbeResult internet) {
        return utcIsoTime(location.getTime()) + ","
                + location.getLatitude() + ","
                + location.getLongitude() + ","
                + valueOrEmpty(location.hasAccuracy(), location.getAccuracy()) + ","
                + valueOrEmpty(location.hasAltitude(), location.getAltitude()) + ","
                + valueOrEmpty(location.hasSpeed(), location.getSpeed()) + ","
                + valueOrEmpty(location.hasBearing(), location.getBearing()) + ","
                + escapeCsv(location.getProvider()) + ","
                + internet.internetOkInt + ","
                + internet.latencyMs;
    }

    private String valueOrEmpty(boolean hasValue, double value) {
        return hasValue ? String.valueOf(value) : "";
    }

    private String escapeCsv(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    private InternetProbeResult checkInternetThroughActiveNetwork() {
        ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (connectivityManager == null) {
            return InternetProbeResult.unavailable();
        }
        Network network = connectivityManager.getActiveNetwork();
        if (network == null) {
            return InternetProbeResult.unavailable();
        }

        try (Socket socket = network.getSocketFactory().createSocket()) {
            long startNanos = System.nanoTime();
            socket.connect(new InetSocketAddress("1.1.1.1", 53), INTERNET_TIMEOUT_MS);
            long latencyMs = Math.max(0L, (System.nanoTime() - startNanos) / 1_000_000L);
            return InternetProbeResult.available(latencyMs);
        } catch (IOException | RuntimeException e) {
            return InternetProbeResult.unavailable();
        }
    }

    private static final class InternetProbeResult {
        final int internetOkInt;
        final long latencyMs;

        private InternetProbeResult(int internetOkInt, long latencyMs) {
            this.internetOkInt = internetOkInt;
            this.latencyMs = latencyMs;
        }

        static InternetProbeResult available(long latencyMs) {
            return new InternetProbeResult(1, latencyMs);
        }

        static InternetProbeResult unavailable() {
            return new InternetProbeResult(0, -1);
        }
    }

    private void persistLatestCsvIfPresent() {
        if (currentCsv == null) {
            return;
        }
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(PREF_LATEST_CSV, currentCsv.getAbsolutePath())
                .apply();
    }

    private File createCsvFile() throws IOException {
        File logsDir = new File(getFilesDir(), "gps_logs");
        if (!logsDir.exists() && !logsDir.mkdirs()) {
            throw new IOException("Cannot create " + logsDir.getAbsolutePath());
        }
        String filename = "road_gps_" + filenameTime() + ".csv";
        return new File(logsDir, filename);
    }

    private String filenameTime() {
        SimpleDateFormat format = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US);
        return format.format(new Date());
    }

    private String utcIsoTime(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private Notification buildNotification(String text) {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return builder
                .setContentTitle("Road GPS Logger")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Road GPS Logger",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Foreground GPS logging status");
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            manager.createNotificationChannel(channel);
        }
    }

    private void sendStatus(String status) {
        Intent intent = new Intent(ACTION_STATUS);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_STATUS, status);
        sendBroadcast(intent);
    }
}
