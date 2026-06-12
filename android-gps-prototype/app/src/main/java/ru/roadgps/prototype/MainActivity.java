package ru.roadgps.prototype;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.ShapeDrawable;
import android.graphics.drawable.shapes.OvalShape;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import org.osmdroid.config.Configuration;
import org.osmdroid.util.BoundingBox;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int REQUEST_PERMISSIONS = 10;
    private static final String TAG = "RoadGpsLogger";
    private static final int MAX_FULL_MARKERS = 300;

    private TextView statusText;
    private TextView mapInfoText;
    private TextView mapLegendText;
    private Button showMapButton;
    private Button resetMapButton;
    private MapView mapView;
    private final ExecutorService mapExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private int mapLoadGeneration = 0;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (GpsLogService.ACTION_STATUS.equals(intent.getAction())) {
                String status = intent.getStringExtra(GpsLogService.EXTRA_STATUS);
                if (status != null) {
                    statusText.setText(status);
                    if (status.startsWith("Status: stopped")) {
                        updateStatusFromStorage();
                    }
                }
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Configuration.getInstance().setUserAgentValue(getPackageName());
        setContentView(R.layout.activity_main);

        statusText = findViewById(R.id.statusText);
        mapInfoText = findViewById(R.id.mapInfoText);
        mapLegendText = findViewById(R.id.mapLegendText);
        showMapButton = findViewById(R.id.showMapButton);
        resetMapButton = findViewById(R.id.resetMapButton);
        mapView = findViewById(R.id.mapView);

        mapView.setMultiTouchControls(true);
        mapView.getController().setZoom(15.0);

        Button startButton = findViewById(R.id.startButton);
        Button stopButton = findViewById(R.id.stopButton);
        Button shareButton = findViewById(R.id.shareButton);

        startButton.setOnClickListener(view -> startRecording());
        stopButton.setOnClickListener(view -> stopRecording());
        shareButton.setOnClickListener(view -> shareLatestCsv());
        showMapButton.setOnClickListener(view -> refreshMapFromLatestCsv());
        resetMapButton.setOnClickListener(view -> resetMap());

        updateStatusFromStorage();
        mapInfoText.setText("Карта не загружается автоматически. Нажмите Показать карту, когда она нужна.");
        mapLegendText.setText("");
    }

    @Override
    protected void onStart() {
        super.onStart();
        mapView.onResume();
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
        mapView.onPause();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        mapLoadGeneration++;
        mapExecutor.shutdownNow();
        super.onDestroy();
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

    private void refreshMapFromLatestCsv() {
        SharedPreferences prefs = getSharedPreferences(GpsLogService.PREFS_NAME, MODE_PRIVATE);
        String latestPath = prefs.getString(GpsLogService.PREF_LATEST_CSV, null);
        showMapButton.setText(latestPath == null ? "Показать карту" : "Обновить карту");

        if (latestPath == null || !new File(latestPath).exists()) {
            resetMap();
            mapInfoText.setText("Сначала запишите трек: Start → Stop, потом нажмите Показать карту");
            return;
        }

        File csvFile = new File(latestPath);
        int generation = ++mapLoadGeneration;
        mapInfoText.setText("Загрузка CSV без блокировки экрана: " + csvFile.getName());
        mapLegendText.setText("");
        Log.d(TAG, "CSV filename: " + csvFile.getName());

        mapExecutor.execute(() -> {
            TrackData trackData = parseTrack(csvFile);
            mainHandler.post(() -> {
                if (generation != mapLoadGeneration) {
                    return;
                }
                renderTrack(csvFile, trackData);
            });
        });
    }

    private void resetMap() {
        mapLoadGeneration++;
        mapView.getOverlays().clear();
        mapView.invalidate();
        mapInfoText.setText("Карта очищена. CSV файлы не удалены.");
        mapLegendText.setText("");
    }

    private void renderTrack(File csvFile, TrackData trackData) {
        boolean simplifiedMode = trackData.points.size() > MAX_FULL_MARKERS;
        List<PointData> markerPoints = simplifiedMode ? samplePoints(trackData.pointDataList, MAX_FULL_MARKERS) : trackData.pointDataList;

        mapView.getOverlays().clear();

        if (trackData.points.isEmpty()) {
            mapInfoText.setText("CSV не содержит точек для карты: " + csvFile.getName());
            mapLegendText.setText("");
            mapView.invalidate();
            Log.d(TAG, "Parsed point count: 0");
            Log.d(TAG, "Rendered marker count: 0");
            Log.d(TAG, "Map mode: full");
            return;
        }

        Polyline line = new Polyline();
        line.setColor(Color.parseColor("#2563EB"));
        line.setWidth(5f);
        line.setPoints(trackData.points);
        mapView.getOverlays().add(line);

        for (PointData pointData : markerPoints) {
            Marker marker = new Marker(mapView);
            marker.setPosition(pointData.point);
            marker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER);
            marker.setIcon(buildMarkerIcon(pointData.color));
            if (pointData.index == 0) {
                marker.setTitle("Start");
            } else if (pointData.index == trackData.points.size() - 1) {
                marker.setTitle("End");
            }
            mapView.getOverlays().add(marker);
        }

        if (trackData.points.size() == 1) {
            mapView.getController().setCenter(trackData.points.get(0));
            mapView.getController().setZoom(15.0);
        } else {
            BoundingBox boundingBox = BoundingBox.fromGeoPoints(trackData.points);
            mapView.zoomToBoundingBox(boundingBox, true, 80);
            if (mapView.getZoomLevelDouble() > 16.0) {
                mapView.getController().setZoom(16.0);
            }
        }
        mapInfoText.setText("Карта показывает последний записанный CSV: " + csvFile.getName()
                + " (точек: " + trackData.points.size()
                + ", маркеров: " + markerPoints.size()
                + ", режим: " + (simplifiedMode ? "упрощённый" : "полный") + ")");
        mapLegendText.setText("Синяя линия — трек. Зелёный — хорошо, оранжевый — задержка, красный — нет/плохо. Для больших треков маркеры прорежены.");
        mapView.invalidate();

        Log.d(TAG, "Parsed point count: " + trackData.points.size());
        Log.d(TAG, "Rendered marker count: " + markerPoints.size());
        Log.d(TAG, "Map mode: " + (simplifiedMode ? "simplified" : "full"));
    }

    private List<PointData> samplePoints(List<PointData> points, int maxMarkers) {
        if (points.size() <= maxMarkers) {
            return points;
        }

        List<PointData> sampled = new ArrayList<>();
        int lastIndex = points.size() - 1;
        for (int i = 0; i < maxMarkers; i++) {
            int sourceIndex = Math.round((float) i * lastIndex / (maxMarkers - 1));
            sampled.add(points.get(sourceIndex));
        }
        return sampled;
    }

    private TrackData parseTrack(File csvFile) {
        List<PointData> points = new ArrayList<>();
        int pointIndex = 0;
        try (BufferedReader reader = new BufferedReader(new FileReader(csvFile))) {
            String line;
            boolean firstLine = true;
            while ((line = reader.readLine()) != null) {
                if (firstLine) {
                    firstLine = false;
                    continue;
                }
                String[] columns = line.split(",");
                if (columns.length < 10) {
                    continue;
                }
                double lat = Double.parseDouble(columns[1]);
                double lon = Double.parseDouble(columns[2]);
                int internetOk = Integer.parseInt(columns[8]);
                long latencyMs = Long.parseLong(columns[9]);
                points.add(new PointData(new GeoPoint(lat, lon), resolveColor(internetOk, latencyMs), pointIndex));
                pointIndex++;
            }
        } catch (IOException | NumberFormatException ignored) {
        }
        return new TrackData(points);
    }

    private ShapeDrawable buildMarkerIcon(int color) {
        ShapeDrawable drawable = new ShapeDrawable(new OvalShape());
        drawable.setIntrinsicWidth(20);
        drawable.setIntrinsicHeight(20);
        Paint paint = drawable.getPaint();
        paint.setColor(color);
        paint.setStyle(Paint.Style.FILL);
        return drawable;
    }

    private int resolveColor(int internetOk, long latencyMs) {
        if (internetOk == 0 || latencyMs == -1 || latencyMs > 500) {
            return Color.parseColor("#DC2626");
        }
        if (latencyMs <= 150) {
            return Color.parseColor("#16A34A");
        }
        return Color.parseColor("#F59E0B");
    }

    private static class TrackData {
        final List<GeoPoint> points;
        final List<PointData> pointDataList;

        TrackData(List<PointData> pointDataList) {
            this.pointDataList = pointDataList;
            this.points = new ArrayList<>();
            for (PointData pointData : pointDataList) {
                points.add(pointData.point);
            }
        }
    }

    private static class PointData {
        final GeoPoint point;
        final int color;
        final int index;

        PointData(GeoPoint point, int color, int index) {
            this.point = point;
            this.color = color;
            this.index = index;
        }
    }
}
