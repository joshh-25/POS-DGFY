package com.dgfy.iminwrapper

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var statusOverlay: LinearLayout
    private lateinit var statusTitle: TextView
    private lateinit var statusMessage: TextView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        statusOverlay = findViewById(R.id.status_overlay)
        statusTitle = findViewById(R.id.status_title)
        statusMessage = findViewById(R.id.status_message)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = false
            builtInZoomControls = false
            displayZoomControls = false
        }

        webView.addJavascriptInterface(IminBridge(), "iMinBridge")
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                showStatus(
                    title = "Loading POS",
                    message = "Opening ${AppConfig.hostedPosUrl()}"
                )
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                statusOverlay.visibility = View.GONE
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
                        message = "WebView error: ${error?.description ?: "unknown error"}"
                    )
                }
            }
        }

        if (savedInstanceState == null) {
            webView.loadUrl(AppConfig.hostedPosUrl())
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

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

    private fun showStatus(title: String, message: String) {
        statusTitle.text = title
        statusMessage.text = message
        statusOverlay.visibility = View.VISIBLE
    }
}
