package com.dgfy.iminwrapper

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
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
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class WebPosActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var statusOverlay: LinearLayout
    private lateinit var statusLogo: ImageView
    private lateinit var statusSpinner: ProgressBar
    private lateinit var statusTitle: TextView
    private lateinit var statusMessage: TextView
    private lateinit var statusRetryButton: Button
    private lateinit var drawerController: DrawerController
    private lateinit var orderAlertSoundStore: OrderAlertSoundStore
    private lateinit var orderAlertPlaybackController: OrderAlertPlaybackController
    private lateinit var iminBridge: IminBridge
    private lateinit var deviceKeyService: IminDeviceKeyService
    private lateinit var deviceProofExecutor: ExecutorService
    private var runtimeCleanupCompleted = true
    private var webPosReadyReceived = false
    private var logoAnimating = false
    private var lastLoadedUrl: String? = null
    private var activeMessageDialog: AlertDialog? = null

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
        orderAlertSoundStore = OrderAlertSoundStore(this)
        orderAlertPlaybackController = OrderAlertPlaybackController(this, orderAlertSoundStore)
        requestBluetoothPermissions()
        statusRetryButton.setOnClickListener { clearWebRuntimeAndReload() }

        // Unlocks chrome://inspect -> Network tab against this WebView, so the
        // actual request scheme/headers are visible instead of guessed. Gated
        // on the manifest's debuggable flag (not BuildConfig.DEBUG) so it can
        // never be on in a release APK regardless of how debuggable ends up
        // set.
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        if (originSwitcherEnabled()) {
            statusLogo.setOnLongClickListener {
                showOriginSwitcherDialog()
                true
            }
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = false
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "$userAgentString DGFY-iMin-WebView"
            builtInZoomControls = false
            displayZoomControls = false
        }

        iminBridge = IminBridge(
            drawerController = drawerController,
            onWebPosReady = {
                runOnUiThread { handleWebPosReady() }
            },
            onShowMessage = { title, message ->
                runOnUiThread { showNativeMessage(title, message) }
            },
            onPlayOrderAlert = { soundType ->
                orderAlertPlaybackController.play(soundType)
            },
            onStopOrderAlert = {
                orderAlertPlaybackController.stop()
            },
            onSaveOrderAlertSound = { soundType, base64Data, mimeType ->
                orderAlertSoundStore.save(soundType, base64Data, mimeType)
            },
            onAsyncResult = { requestId, resultJson ->
                runOnUiThread { dispatchIminAsyncResult(requestId, resultJson) }
            }
        )
        webView.addJavascriptInterface(
            iminBridge,
            "iMinBridge"
        )
        deviceKeyService = IminDeviceKeyService(this)
        deviceProofExecutor = Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "dgfy-device-proof").apply { isDaemon = true }
        }
        registerDeviceProofListener()
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
                val scheme = url?.let { Uri.parse(it).scheme } ?: "unknown"
                Log.i(TAG, "onPageStarted: url=$url scheme=$scheme")
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
                return if (isAllowedNavigation(targetUrl.host, targetUrl.scheme)) {
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

        loadWebPos()
    }

    override fun onDestroy() {
        activeMessageDialog?.dismiss()
        activeMessageDialog = null
        orderAlertPlaybackController.release()
        if (::deviceProofExecutor.isInitialized) {
            deviceProofExecutor.shutdownNow()
        }
        iminBridge.release()
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

    private fun isAllowedNavigation(host: String?, scheme: String?): Boolean {
        return WebPosNavigationPolicy.isPermitted(
            host,
            scheme,
            AppConfig.allowedHosts(WebPosOriginStore.read(this)),
            AppConfig.cleartextAllowedHosts()
        )
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
        val origin = AppConfig.effectiveOrigin(WebPosOriginStore.read(this))
        showStatus(
            title = "DGFY POS",
            message = "Preparing your terminal...\n$origin",
            showRetry = false,
            showSpinner = true
        )
    }

    private fun buildTimeoutMessage(url: String?): String {
        val targetUrl = url?.takeIf { it.isNotBlank() }
            ?: AppConfig.hostedWebPosUrl(WebPosOriginStore.read(this), 0L)
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

    private fun dispatchIminAsyncResult(requestId: String, resultJson: String) {
        if (isFinishing || isDestroyed) return
        val safeRequestId = JSONObject.quote(requestId)
        val safeResultJson = JSONObject.quote(resultJson)
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('dgfy:imin-command-result'," +
                "{detail:{requestId:$safeRequestId,result:$safeResultJson}}));",
            null
        )
    }

    private fun registerDeviceProofListener() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // The server-side strict policy fails closed when no proof channel
            // is available. Do not fall back to addJavascriptInterface here.
            Log.w(TAG, "Origin-bound device proof is unavailable in this WebView")
            return
        }

        WebViewCompat.addWebMessageListener(
            webView,
            "iMinDeviceProof",
            AppConfig.approvedDeviceProofOriginRules(),
            object : WebViewCompat.WebMessageListener {
                override fun onPostMessage(
                    view: WebView,
                    message: WebMessageCompat,
                    sourceOrigin: Uri,
                    isMainFrame: Boolean,
                    replyProxy: JavaScriptReplyProxy
                ) {
                    val origin = sourceOrigin.toString()
                    if (!DeviceProofOriginPolicy.isPermitted(origin, isMainFrame)) {
                        postDeviceProofResponse(
                            replyProxy,
                            JSONObject()
                                .put("id", "")
                                .put("success", false)
                                .put("error_code", if (isMainFrame) "ORIGIN_NOT_APPROVED" else "FRAME_NOT_APPROVED")
                                .put("message", "The device proof channel is restricted to the approved POS main frame.")
                        )
                        return
                    }

                    val rawMessage = message.data.orEmpty()
                    if (rawMessage.toByteArray(Charsets.UTF_8).size > MAX_DEVICE_PROOF_MESSAGE_BYTES) {
                        postDeviceProofResponse(
                            replyProxy,
                            JSONObject()
                                .put("id", "")
                                .put("success", false)
                                .put("error_code", "MESSAGE_TOO_LARGE")
                                .put("message", "The device proof request is too large.")
                        )
                        return
                    }

                    val request = runCatching { JSONObject(rawMessage) }.getOrElse {
                        postDeviceProofResponse(
                            replyProxy,
                            JSONObject()
                                .put("id", "")
                                .put("success", false)
                                .put("error_code", "MALFORMED_REQUEST")
                                .put("message", "The device proof request is not valid JSON.")
                        )
                        return
                    }

                    // WebMessageListener callbacks run on the WebView thread;
                    // key-store access and signing must never block the UI.
                    runCatching {
                        deviceProofExecutor.execute {
                            val response = deviceKeyService.handleMessage(request)
                            postDeviceProofResponse(replyProxy, response)
                        }
                    }.onFailure {
                        postDeviceProofResponse(
                            replyProxy,
                            JSONObject()
                                .put("id", request.optString("id", ""))
                                .put("success", false)
                                .put("error_code", "DEVICE_PROOF_UNAVAILABLE")
                                .put("message", "The device proof service is unavailable.")
                        )
                    }
                }
            }
        )
    }

    private fun postDeviceProofResponse(replyProxy: JavaScriptReplyProxy, response: JSONObject) {
        runOnUiThread {
            runCatching { replyProxy.postMessage(response.toString()) }
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
            webView.postDelayed({ loadWebPos() }, 250L)
        }
    }

    private fun loadWebPos() {
        val override = WebPosOriginStore.read(this)
        val url = AppConfig.hostedWebPosUrl(override)
        Log.i(TAG, "Loading WebPos: $url (origin=${AppConfig.effectiveOrigin(override)})")
        webView.loadUrl(url)
    }

    // Dev/staging-only escape hatch: an emulator always resolves to the local
    // Vite dev server by default (AppConfig.useLivePosOrigin), which made it
    // impossible to point a tablet AVD (no physical Android tablet available)
    // at the real dev/staging origin without a rebuild. Never enabled on a
    // prod build regardless of build type, so a production terminal can't
    // be repointed by a long-press.
    private fun originSwitcherEnabled(): Boolean {
        return BuildConfig.DEBUG || BuildConfig.FLAVOR == "dev" || BuildConfig.FLAVOR == "staging"
    }

    private fun showOriginSwitcherDialog() {
        val current = WebPosOriginStore.read(this)
        val options = arrayOf(
            "Local dev (${AppConfig.localDevOrigin()})",
            "Live (${BuildConfig.LIVE_POS_ORIGIN})",
            "Custom..."
        )
        AlertDialog.Builder(this)
            .setTitle("WebView origin (testing only)")
            .setMessage("Currently: ${AppConfig.effectiveOrigin(current)}")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> applyOriginOverride(AppConfig.localDevOrigin())
                    1 -> applyOriginOverride(BuildConfig.LIVE_POS_ORIGIN)
                    2 -> showCustomOriginInput()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showCustomOriginInput() {
        val input = EditText(this).apply {
            hint = "https://pos.example.dgfy.ph"
            setText(WebPosOriginStore.read(this@WebPosActivity).orEmpty())
        }
        AlertDialog.Builder(this)
            .setTitle("Custom origin")
            .setView(input)
            .setPositiveButton("Load") { _, _ -> applyOriginOverride(input.text.toString()) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun applyOriginOverride(origin: String?) {
        WebPosOriginStore.write(this, origin)
        clearWebRuntimeAndReload()
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
        private const val MAX_DEVICE_PROOF_MESSAGE_BYTES = 64 * 1024
    }
}
