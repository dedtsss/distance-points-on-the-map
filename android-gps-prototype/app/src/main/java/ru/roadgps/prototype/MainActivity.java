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

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final int REQUEST_PERMISSIONS = 10;

    private TextView statusText;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (GpsLogService.ACTION_STATUS.equals(intent.getAction())) {
                String status = intent.getStringExtra(GpsLogService.EXTRA_STATUS);
                if (status != null) {
                    statusText.setText(status);
                }
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusText = findViewById(R.id.statusText);
        Button startButton = findViewById(R.id.startButton);
        Button stopButton = findViewById(R.id.stopButton);
        Button shareButton = findViewById(R.id.shareButton);

        startButton.setOnClickListener(view -> startRecording());
        stopButton.setOnClickListener(view -> stopRecording());
        shareButton.setOnClickListener(view -> shareLatestCsv());

        updateStatusFromStorage();
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
}
