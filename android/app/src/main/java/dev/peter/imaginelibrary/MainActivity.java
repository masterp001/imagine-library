package dev.peter.imaginelibrary;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Draw behind the system bars; the web app pads itself with env(safe-area-inset-*).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
