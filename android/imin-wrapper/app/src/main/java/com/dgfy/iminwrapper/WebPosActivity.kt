package com.dgfy.iminwrapper

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat

class WebPosActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var statusOverlay: LinearLayout
    private lateinit var statusLogo: ImageView
    private lateinit var statusSpinner: ProgressBar
    private lateinit var statusTitle: TextView
    private lateinit var statusMessage: TextView
    private lateinit var statusRetryButton: Button
    private lateinit var drawerController: DrawerController
    private var runtimeCleanupCompleted = true
    private var webPosReadyReceived = false
    private var logoAnimating = false
    private var lastLoadedUrl: String? = null
    private var activeMessageDialog: AlertDialog? = null
    private var orderAlertRingtone: Ringtone? = null
    private var orderAlertToneGenerator: ToneGenerator? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_web_pos)

        webView = findViewById(R.id.webview)
        statusOverlay = findViewById(R.id.status_overlay)
        statusLogo = findViewById(R.id.status_logo)
        statusSpinner = findViewById(R.id.status_spinner)
        statusTitle = findViewById(R.id.status_title)
        statusMessage = findViewById(R.id.status_message)
        statusRetryButton = findViewById(R.id.status_retry_button)
        drawerController = DrawerController(this)
        orderAlertToneGenerator = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
        orderAlertRingtone = resolveOrderAlertRingtone()
        requestBluetoothPermissions()
        statusRetryButton.setOnClickListener { clearWebRuntimeAndReload() }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = false
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "$userAgentString DGFY-iMin-WebView"
            builtInZoomControls = false
            displayZoomControls = false
        }

        webView.addJavascriptInterface(
            IminBridge(
                drawerController = drawerController,
                onWebPosReady = {
                    runOnUiThread { handleWebPosReady() }
                },
                onShowMessage = { title, message ->
                    runOnUiThread { showNativeMessage(title, message) }
                },
                onPlayOrderAlert = {
                    runOnUiThread { playOrderAlert() }
                }
            ),
            "iMinBridge"
        )
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                val message = consoleMessage?.message().orEmpty()
                val isErrorLevel =
                    consoleMessage?.messageLevel() == ConsoleMessage.MessageLevel.ERROR
                when (
                    WebPosConsoleErrorPolicy.classify(isErrorLevel, message, webPosReadyReceived)
                ) {
                    ConsoleAction.BLOCK -> showStatus(
                        title = "Web POS script error",
                        message = message.ifBlank { "Unknown WebView JavaScript error" },
                        showRetry = true,
                        showSpinner = false
                    )
                    ConsoleAction.LOG_ONLY -> Log.w(
                        TAG,
                        "WebView console error: $message " +
                            "(${consoleMessage?.sourceId()}:${consoleMessage?.lineNumber()})"
                    )
                    ConsoleAction.IGNORE -> Unit
                }
                return super.onConsoleMessage(consoleMessage)
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                webPosReadyReceived = false
                lastLoadedUrl = url
                showLoadingStatus()
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                webView.postDelayed({
                    if (!webPosReadyReceived && webView.progress >= 100) {
                        showStatus(
                            title = "POS startup timeout",
                            message = buildTimeoutMessage(url ?: lastLoadedUrl),
                            showRetry = true,
                            showSpinner = false
                        )
                    }
                }, READY_SIGNAL_FALLBACK_MS)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val targetUrl = request?.url ?: return false
                return if (isAllowedHost(targetUrl.host)) {
                    false
                } else {
                    startActivity(Intent(Intent.ACTION_VIEW, targetUrl))
                    true
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    showStatus(
                        title = "POS failed to load",
                        message = "WebView error: ${error?.description ?: "unknown error"}",
                        showRetry = true,
                        showSpinner = false
                    )
                }
            }
        }

        webView.loadUrl(AppConfig.hostedWebPosUrl())
    }

    override fun onDestroy() {
        activeMessageDialog?.dismiss()
        activeMessageDialog = null
        orderAlertRingtone?.stop()
        orderAlertRingtone = null
        orderAlertToneGenerator?.release()
        orderAlertToneGenerator = null
        drawerController.release()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun isAllowedHost(host: String?): Boolean {
        return host != null && AppConfig.allowedHosts().contains(host)
    }

    private fun showStatus(
        title: String,
        message: String,
        showRetry: Boolean = false,
        showSpinner: Boolean = true
    ) {
        startLogoAnimation()
        statusTitle.text = title
        statusMessage.text = message
        statusSpinner.visibility = if (showSpinner) View.VISIBLE else View.GONE
        statusRetryButton.visibility = if (showRetry) View.VISIBLE else View.GONE
        statusOverlay.visibility = View.VISIBLE
    }

    private fun showLoadingStatus() {
        showStatus(
            title = "DGFY POS",
            message = "Preparing your terminal...",
            showRetry = false,
            showSpinner = true
        )
    }

    private fun buildTimeoutMessage(url: String?): String {
        val targetUrl = url?.takeIf { it.isNotBlank() } ?: AppConfig.hostedWebPosUrl(0L)
        return "POS did not become ready within 10 seconds.\nCheck device network, confirm the POS server is online, and verify this URL is reachable:\n$targetUrl"
    }

    private fun handleWebPosReady() {
        if (!runtimeCleanupCompleted) return
        webPosReadyReceived = true
        hideStatusOverlay()
    }

    private fun hideStatusOverlay() {
        stopLogoAnimation()
        statusOverlay.visibility = View.GONE
    }

    private fun showNativeMessage(title: String, message: String) {
        if (isFinishing || isDestroyed) return
        activeMessageDialog?.dismiss()
        activeMessageDialog = AlertDialog.Builder(this)
            .setTitle(title.ifBlank { "iMin message" })
            .setMessage(message.ifBlank { "No details provided." })
            .setPositiveButton("OK", null)
            .create()
        activeMessageDialog?.show()
    }

    private fun resolveOrderAlertRingtone(): Ringtone? {
        val notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: return null

        return try {
            RingtoneManager.getRingtone(applicationContext, notificationUri)
        } catch (_: Exception) {
            null
        }
    }

    private fun playOrderAlert() {
        if (isFinishing || isDestroyed) return

        val ringtone = orderAlertRingtone
        if (ringtone != null) {
            try {
                if (ringtone.isPlaying) {
                    ringtone.stop()
                }
                ringtone.play()
                return
            } catch (_: Exception) {
                // Fall back to a short notification tone if the ringtone cannot play.
            }
        }

        try {
            orderAlertToneGenerator?.startTone(ToneGenerator.TONE_PROP_BEEP2, 250)
        } catch (_: Exception) {
            // Ignore tone playback failures to avoid crashing the POS shell.
        }
    }

    private fun startLogoAnimation() {
        if (logoAnimating) return
        logoAnimating = true
        pulseLogo()
    }

    private fun pulseLogo() {
        statusLogo.animate()
            .scaleX(1.06f)
            .scaleY(1.06f)
            .setDuration(650L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction {
                statusLogo.animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(650L)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .withEndAction {
                        if (logoAnimating && statusOverlay.visibility == View.VISIBLE) {
                            pulseLogo()
                        }
                    }
                    .start()
            }
            .start()
    }

    private fun stopLogoAnimation() {
        logoAnimating = false
        statusLogo.animate().cancel()
        statusLogo.scaleX = 1f
        statusLogo.scaleY = 1f
    }

    private fun clearWebRuntimeAndReload() {
        webPosReadyReceived = false
        showLoadingStatus()
        val cleanupScript = """
            (async function () {
              try {
                if ('serviceWorker' in navigator) {
                  const registrations = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(registrations.map(function (registration) {
                    return registration.unregister();
                  }));
                }
                if ('caches' in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(function (key) {
                    return caches.delete(key);
                  }));
                }
                try { localStorage.removeItem('vite-pwa-register'); } catch (error) {}
              } catch (error) {}
              return true;
            })();
        """.trimIndent()

        webView.evaluateJavascript(cleanupScript) {
            webView.clearCache(true)
            webView.clearHistory()
            webView.postDelayed(
                { webView.loadUrl(AppConfig.hostedWebPosUrl()) },
                250L
            )
        }
    }

    private fun requestBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.BLUETOOTH_CONNECT),
                BLUETOOTH_PERMISSION_REQUEST_CODE
            )
        }
    }

    companion object {
        private const val TAG = "WebPosActivity"
        private const val BLUETOOTH_PERMISSION_REQUEST_CODE = 7001
        private const val READY_SIGNAL_FALLBACK_MS = 10_000L
    }
}
