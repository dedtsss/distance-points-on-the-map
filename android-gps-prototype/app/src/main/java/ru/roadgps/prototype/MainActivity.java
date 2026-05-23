package ru.roadgps.prototype;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import org.osmdroid.config.Configuration;
import org.osmdroid.tileprovider.tilesource.TileSourceFactory;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.MapView;
import org.osmdroid.views.overlay.Marker;
import org.osmdroid.views.overlay.Polyline;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final int REQUEST_PERMISSIONS = 10;

    private TextView statusText;
    private MapView mapView;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (GpsLogService.ACTION_STATUS.equals(intent.getAction())) {
                String status = intent.getStringExtra(GpsLogService.EXTRA_STATUS);
                if (status != null) {
                    statusText.setText(status);
                }
                loadLatestTrackOnMap();
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Configuration.getInstance().setUserAgentValue(getPackageName());
        setContentView(R.layout.activity_main);

        statusText = findViewById(R.id.statusText);
        mapView = findViewById(R.id.mapView);
        mapView.setTileSource(TileSourceFactory.MAPNIK);
        mapView.setMultiTouchControls(true);

        Button startButton = findViewById(R.id.startButton);
        Button stopButton = findViewById(R.id.stopButton);
        Button shareButton = findViewById(R.id.shareButton);

        startButton.setOnClickListener(view -> startRecording());
        stopButton.setOnClickListener(view -> stopRecording());
        shareButton.setOnClickListener(view -> shareLatestCsv());

        updateStatusFromStorage();
        loadLatestTrackOnMap();
    }

    @Override
    protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(GpsLogService.ACTION_STATUS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(statusReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(statusReceiver, filter);
        }
    }

    @Override
    protected void onStop() {
        unregisterReceiver(statusReceiver);
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mapView != null) {
            mapView.onResume();
            loadLatestTrackOnMap();
        }
    }

    @Override
    protected void onPause() {
        if (mapView != null) {
            mapView.onPause();
        }
        super.onPause();
    }

    private void startRecording() {
        List<String> missingPermissions = getMissingPermissions();
        if (!missingPermissions.isEmpty()) {
            requestPermissions(missingPermissions.toArray(new String[0]), REQUEST_PERMISSIONS);
            return;
        }

        Intent intent = new Intent(this, GpsLogService.class);
        intent.setAction(GpsLogService.ACTION_START);
        ContextCompat.startForegroundService(this, intent);
        statusText.setText("Status: starting GPS recording...");
    }

    private void stopRecording() {
        Intent intent = new Intent(this, GpsLogService.class);
        intent.setAction(GpsLogService.ACTION_STOP);
        startService(intent);
    }

    private List<String> getMissingPermissions() {
        List<String> permissions = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        return permissions;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_PERMISSIONS) {
            if (getMissingPermissions().isEmpty()) {
                startRecording();
            } else {
                Toast.makeText(this, "Location and notification permissions are required for background recording.", Toast.LENGTH_LONG).show();
                statusText.setText("Status: permissions required");
            }
        }
    }

    private void shareLatestCsv() {
        SharedPreferences prefs = getSharedPreferences(GpsLogService.PREFS_NAME, MODE_PRIVATE);
        String latestPath = prefs.getString(GpsLogService.PREF_LATEST_CSV, null);
        if (latestPath == null) {
            Toast.makeText(this, "No CSV has been recorded yet.", Toast.LENGTH_SHORT).show();
            return;
        }

        File csv = new File(latestPath);
        if (!csv.exists()) {
            Toast.makeText(this, "Latest CSV was not found.", Toast.LENGTH_SHORT).show();
            return;
        }

        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", csv);
        Intent shareIntent = new Intent(Intent.ACTION_SEND);
        shareIntent.setType("text/csv");
        shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(shareIntent, "Share GPS CSV"));
    }

    private void updateStatusFromStorage() {
        SharedPreferences prefs = getSharedPreferences(GpsLogService.PREFS_NAME, MODE_PRIVATE);
        String latestPath = prefs.getString(GpsLogService.PREF_LATEST_CSV, null);
        if (latestPath == null) {
            statusText.setText("Status: idle; no CSV recorded yet");
        } else {
            statusText.setText("Status: idle; latest CSV: " + new File(latestPath).getName());
        }
    }

    private void loadLatestTrackOnMap() {
        if (mapView == null) {
            return;
        }
        mapView.getOverlays().clear();

        List<GeoPoint> points = readLatestTrackPoints();
        if (points.isEmpty()) {
            mapView.getController().setZoom(3.0);
            mapView.getController().setCenter(new GeoPoint(20.0, 0.0));
            mapView.invalidate();
            return;
        }

        Polyline path = new Polyline();
        path.setPoints(points);
        mapView.getOverlays().add(path);

        Marker startMarker = new Marker(mapView);
        startMarker.setPosition(points.get(0));
        startMarker.setTitle("Start");
        mapView.getOverlays().add(startMarker);

        Marker endMarker = new Marker(mapView);
        endMarker.setPosition(points.get(points.size() - 1));
        endMarker.setTitle("Latest");
        mapView.getOverlays().add(endMarker);

        mapView.zoomToBoundingBox(path.getBounds(), true, 64);
        mapView.invalidate();
    }

    private List<GeoPoint> readLatestTrackPoints() {
        SharedPreferences prefs = getSharedPreferences(GpsLogService.PREFS_NAME, MODE_PRIVATE);
        String latestPath = prefs.getString(GpsLogService.PREF_LATEST_CSV, null);
        List<GeoPoint> points = new ArrayList<>();
        if (latestPath == null) {
            return points;
        }

        File csv = new File(latestPath);
        if (!csv.exists()) {
            return points;
        }

        try (BufferedReader reader = new BufferedReader(new FileReader(csv))) {
            String line;
            boolean isFirstLine = true;
            while ((line = reader.readLine()) != null) {
                if (isFirstLine) {
                    isFirstLine = false;
                    continue;
                }
                String[] columns = line.split(",");
                if (columns.length < 3) {
                    continue;
                }
                double lat = Double.parseDouble(columns[1]);
                double lon = Double.parseDouble(columns[2]);
                points.add(new GeoPoint(lat, lon));
            }
        } catch (IOException | NumberFormatException ignored) {
            // Keep map usable even with partial/broken CSV rows.
        }

        return points;
    }
}
