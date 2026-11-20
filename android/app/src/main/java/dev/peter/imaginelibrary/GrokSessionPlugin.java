package dev.peter.imaginelibrary;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * Grok sign-in inside the app.
 *
 * login()     opens grok.com in a full-screen WebView. Android's CookieManager is shared by
 *             every WebView in the app, so the session stays available afterwards.
 * getCookie() returns the Cookie header for a URL (including HttpOnly cookies, which the
 *             web layer can't read) so native downloads from assets.grok.com can send it.
 * api()       POSTs to a grok.com /rest/ endpoint from inside a hidden grok.com page, so the
 *             request carries the session exactly like the website's own requests.
 */
@CapacitorPlugin(name = "GrokSession")
public class GrokSessionPlugin extends Plugin {

    private static final String HOME = "https://grok.com/";
    private static final Pattern SSO = Pattern.compile("(^|;\\s*)sso(-rw)?=[^;]+");

    /** Chrome-like UA (no "; wv" marker): fewer sign-in providers refuse it. Downloads reuse it. */
    private String userAgent() {
        String ua = WebSettings.getDefaultUserAgent(getContext());
        return ua.replace("; wv)", ")").replaceAll("Version/\\d+(\\.\\d+)* ", "");
    }

    private boolean signedIn() {
        String c = CookieManager.getInstance().getCookie(HOME);
        return c != null && SSO.matcher(c).find();
    }

    private JSObject state() {
        JSObject r = new JSObject();
        r.put("signedIn", signedIn());
        r.put("userAgent", userAgent());
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void getCookie(PluginCall call) {
        String url = call.getString("url", HOME);
        String c = CookieManager.getInstance().getCookie(url);
        JSObject r = state();
        r.put("cookie", c == null ? "" : c);
        call.resolve(r);
    }

    @PluginMethod
    public void logout(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            CookieManager cm = CookieManager.getInstance();
            cm.removeAllCookies(done -> {
                cm.flush();
                call.resolve(state());
            });
        });
    }

    // ---------------- api() via a hidden grok.com page ----------------
    private WebView apiView;
    private boolean apiReady = false;
    private final List<Runnable> apiQueue = new ArrayList<>();
    private final Map<String, PluginCall> apiCalls = new ConcurrentHashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());

    private class Bridge {
        @JavascriptInterface
        public void done(String id, int status, String text) {
            PluginCall c = apiCalls.remove(id);
            if (c == null) return;
            JSObject r = new JSObject();
            r.put("status", status);
            r.put("text", text);
            c.resolve(r);
        }
    }

    private void loadApiPage(boolean full) {
        apiReady = false;
        // robots.txt is a tiny same-origin document; the full app page clears any challenge.
        apiView.loadUrl(full ? "https://grok.com/imagine" : "https://grok.com/robots.txt");
    }

    private void ensureApiView() {
        if (apiView != null) return;
        apiView = new WebView(getContext());
        WebSettings s = apiView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(userAgent());
        CookieManager.getInstance().setAcceptThirdPartyCookies(apiView, true);
        apiView.addJavascriptInterface(new Bridge(), "ImagineBridge");
        apiView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (apiReady) return;
                apiReady = true;
                List<Runnable> q = new ArrayList<>(apiQueue);
                apiQueue.clear();
                for (Runnable r : q) r.run();
            }
        });
        loadApiPage(false);
    }

    @PluginMethod
    public void api(PluginCall call) {
        String path = call.getString("path", "");
        String body = call.getString("body", "{}");
        boolean reload = Boolean.TRUE.equals(call.getBoolean("reload", false));
        if (!path.startsWith("/rest/")) {
            call.reject("Only grok.com /rest/ paths are allowed");
            return;
        }
        String id = UUID.randomUUID().toString();
        apiCalls.put(id, call);
        main.post(() -> {
            ensureApiView();
            if (reload) loadApiPage(true);
            String js = "(async()=>{try{const r=await fetch(" + JSONObject.quote(path)
                + ",{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:"
                + JSONObject.quote(body) + "});ImagineBridge.done(" + JSONObject.quote(id)
                + ",r.status,await r.text())}catch(e){ImagineBridge.done(" + JSONObject.quote(id) + ",0,String(e))}})()";
            Runnable run = () -> apiView.evaluateJavascript(js, null);
            if (apiReady) run.run();
            else apiQueue.add(run);
        });
        main.postDelayed(() -> {
            PluginCall c = apiCalls.remove(id);
            if (c != null) c.reject("Timed out talking to grok.com");
        }, 90_000);
    }

    @PluginMethod
    public void login(PluginCall call) {
        Activity a = getActivity();
        a.runOnUiThread(() -> openLogin(a, call));
    }

    private void openLogin(Activity a, PluginCall call) {
        float dp = a.getResources().getDisplayMetrics().density;
        Dialog d = new Dialog(a, android.R.style.Theme_DeviceDefault_NoActionBar);

        LinearLayout root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#141218"));

        LinearLayout bar = new LinearLayout(a);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding((int) (16 * dp), (int) (8 * dp), (int) (8 * dp), (int) (8 * dp));
        bar.setBackgroundColor(Color.parseColor("#211F26"));

        TextView title = new TextView(a);
        title.setText("Sign in to Grok, then tap Done");
        title.setTextColor(Color.parseColor("#E6E0E9"));
        title.setTextSize(15);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button done = new Button(a);
        done.setText("Done");
        done.setAllCaps(false);
        done.setTextColor(Color.parseColor("#381E72"));
        done.setBackgroundColor(Color.parseColor("#D0BCFF"));
        bar.addView(done, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, (int) (40 * dp)));
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ProgressBar progress = new ProgressBar(a, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (int) (3 * dp)));

        WebView wv = new WebView(a);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // window.open() (OAuth pop-ups) loads in this same view.
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUserAgentString(userAgent());
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);
        wv.setWebViewClient(new WebViewClient());
        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                progress.setProgress(p);
                progress.setVisibility(p >= 100 ? android.view.View.INVISIBLE : android.view.View.VISIBLE);
            }
        });
        root.addView(wv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Keep the bar clear of the status bar / the page clear of the navigation bar.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        done.setOnClickListener(v -> d.dismiss());
        d.setOnKeyListener((dlg, code, ev) -> {
            if (code == KeyEvent.KEYCODE_BACK && ev.getAction() == KeyEvent.ACTION_UP) {
                if (wv.canGoBack()) wv.goBack();
                else d.dismiss();
                return true;
            }
            return false;
        });
        d.setOnDismissListener(x -> {
            CookieManager.getInstance().flush();
            wv.stopLoading();
            wv.destroy();
            call.resolve(state());
        });

        d.setContentView(root);
        d.show();
        wv.loadUrl(HOME);
    }
}
