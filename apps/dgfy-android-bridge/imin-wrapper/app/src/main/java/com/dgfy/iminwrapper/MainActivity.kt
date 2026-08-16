package com.dgfy.iminwrapper

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Space
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class MainActivity : AppCompatActivity() {
    private val apiClient = NativePosApiClient()
    private lateinit var drawerController: DrawerController
    private lateinit var prefs: SharedPreferences

    private lateinit var apiBaseInput: EditText
    private lateinit var companyTokenInput: EditText
    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var terminalInput: EditText
    private lateinit var statusText: TextView
    private lateinit var catalogContainer: LinearLayout
    private lateinit var cartContainer: LinearLayout
    private lateinit var historyContainer: LinearLayout
    private lateinit var totalText: TextView

    private var session: NativePosApiClient.Session? = null
    private var activeShift: NativePosApiClient.Shift? = null
    private var catalog: List<NativePosApiClient.CatalogItem> = emptyList()
    private var transactions: List<NativePosApiClient.TransactionSummary> = emptyList()
    private val cart = mutableListOf<NativeCartLine>()
    private val compactBridgeLayout: Boolean
        get() = resources.configuration.screenWidthDp in 1..899

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        drawerController = DrawerController(this)
        prefs = getSharedPreferences("native_pos", MODE_PRIVATE)
        requestBluetoothPermissions()
        setContentView(buildContent())
        restoreInputs()
        restoreOfflineState()
        renderCart()
        setStatus("Native POS ready. Cached catalog: ${catalog.size}. Offline queue: ${offlineQueueCount()}.")
        window.decorView.post { showStartupModalTest() }
    }

    override fun onDestroy() {
        drawerController.release()
        super.onDestroy()
    }

    private fun buildContent(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(PALETTE_BG)
        }

        root.addView(buildHeader())

        val scroll = ScrollView(this).apply {
            isFillViewport = true
            layoutParams = LinearLayout.LayoutParams(match(), 0, 1f)
        }
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(14), dp(14), dp(18))
        }
        scroll.addView(body)

        body.addView(buildSetupPanel())
        body.addView(space(12))
        body.addView(buildActionPanel())
        body.addView(space(12))
        body.addView(buildWorkspace())
        body.addView(space(12))
        body.addView(buildHistoryPanel())

        root.addView(scroll)
        return root
    }

    private fun buildHeader(): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
            setBackgroundColor(Color.WHITE)
            elevation = dp(3).toFloat()

            addView(TextView(context).apply {
                text = "DGFY Terminal Workspace"
                setTextColor(PALETTE_TEXT)
                textSize = 20f
                typeface = Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(0, wrap(), 1f)
            })

            addView(Button(context).apply {
                text = "Web POS"
                setTextColor(Color.WHITE)
                background = rounded(PALETTE_PRIMARY, 8)
                setOnClickListener { startActivity(Intent(this@MainActivity, WebPosActivity::class.java)) }
            })
        }
    }

    private fun buildSetupPanel(): View {
        return panel().apply {
            addView(sectionTitle("Native Login"))
            apiBaseInput = input("API Base URL", InputType.TYPE_CLASS_TEXT)
            companyTokenInput = input("Company token", InputType.TYPE_CLASS_TEXT)
            emailInput = input("Email", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
            passwordInput = input("Password", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
            terminalInput = input("Terminal ID", InputType.TYPE_CLASS_TEXT)
            addView(apiBaseInput)
            addView(companyTokenInput)
            addView(emailInput)
            addView(passwordInput)
            addView(terminalInput)
            addView(row(
                actionButton("Login") { login() },
                actionButton("Load Catalog") { loadCatalog() }
            ))
            addView(row(
                actionButton("Load Offline Cache") { loadOfflineCache() },
                actionButton("Sync Offline") { syncOfflineSales() }
            ))
            addView(row(
                actionButton("Check Shift") { checkShift() },
                actionButton("Open Shift") { openShift() }
            ))
            statusText = TextView(context).apply {
                setTextColor(PALETTE_MUTED)
                textSize = 13f
                setPadding(0, dp(8), 0, 0)
            }
            addView(statusText)
        }
    }

    private fun buildActionPanel(): View {
        return panel().apply {
            addView(sectionTitle("Hardware"))
            addView(row(
                actionButton("Print Test") { printTestReceipt() },
                actionButton("Open Drawer") { openDrawerOnly() }
            ))
            addView(row(
                actionButton("Print + Drawer") { printAndOpenDrawer() },
                actionButton("Diagnostics") { showDiagnostics() }
            ))
            addView(row(
                actionButton("Pulse A") { testDrawerPulse("A", byteArrayOf(0x1B, 0x70, 0x00, 0x19, 0xFA.toByte())) },
                actionButton("Pulse B") { testDrawerPulse("B", byteArrayOf(0x1B, 0x70, 0x01, 0x19, 0xFA.toByte())) }
            ))
            addView(row(
                actionButton("Pulse C") { testDrawerPulse("C", byteArrayOf(0x1B, 0x70, 0x00, 0x32, 0xFA.toByte())) },
                actionButton("Pulse D") { testDrawerPulse("D", byteArrayOf(0x1B, 0x70, 0x01, 0x32, 0xFA.toByte())) }
            ))
            addView(row(
                actionButton("Pulse E") { testDrawerPulse("E", byteArrayOf(0x10, 0x14, 0x00, 0x00, 0x00)) },
                actionButton("Pulse F") { testDrawerPulse("F", byteArrayOf(0x10, 0x14, 0x01, 0x00, 0x00)) }
            ))
        }
    }

    private fun buildWorkspace(): View {
        return LinearLayout(this).apply {
            orientation = if (compactBridgeLayout) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
            isBaselineAligned = false

            val catalogPanel = panel().apply {
                layoutParams = if (compactBridgeLayout) {
                    LinearLayout.LayoutParams(match(), wrap()).apply {
                        bottomMargin = dp(10)
                    }
                } else {
                    LinearLayout.LayoutParams(0, wrap(), 1.45f).apply {
                        marginEnd = dp(10)
                    }
                }
                addView(sectionTitle("Sales"))
                catalogContainer = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                }
                addView(catalogContainer)
            }

            val cartPanel = panel().apply {
                layoutParams = if (compactBridgeLayout) {
                    LinearLayout.LayoutParams(match(), wrap())
                } else {
                    LinearLayout.LayoutParams(0, wrap(), 1f)
                }
                addView(sectionTitle("Current Sale"))
                cartContainer = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                }
                addView(cartContainer)
                totalText = TextView(context).apply {
                    setTextColor(PALETTE_TEXT)
                    textSize = 20f
                    typeface = Typeface.DEFAULT_BOLD
                    gravity = Gravity.END
                    setPadding(0, dp(14), 0, dp(8))
                }
                addView(totalText)
                addView(actionButton("Checkout") { confirmCheckout() }.apply {
                    layoutParams = LinearLayout.LayoutParams(match(), dp(52))
                })
            }

            addView(catalogPanel)
            addView(cartPanel)
        }
    }

    private fun buildHistoryPanel(): View {
        return panel().apply {
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(sectionTitle("Receipt History").apply {
                    layoutParams = LinearLayout.LayoutParams(0, wrap(), 1f)
                })
                addView(actionButton("Refresh") { loadHistory() }.apply {
                    layoutParams = LinearLayout.LayoutParams(dp(120), dp(44))
                })
            })
            historyContainer = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
            }
            addView(historyContainer)
        }
    }

    private fun login() {
        saveInputs()
        runBackground("Logging in...") {
            val nextSession = apiClient.login(
                apiBaseUrl = apiBaseInput.text.toString(),
                companyToken = companyTokenInput.text.toString(),
                email = emailInput.text.toString(),
                password = passwordInput.text.toString()
            )
            session = nextSession
            saveSession(nextSession)
            "Login successful. Offline queue: ${offlineQueueCount()}."
        }
    }

    private fun loadCatalog() {
        val currentSession = requireSession() ?: return
        saveInputs()
        runBackground("Loading catalog...") {
            catalog = apiClient.fetchCatalog(
                apiBaseUrl = apiBaseInput.text.toString(),
                session = currentSession,
                limit = 120
            )
            saveCatalog(catalog)
            runOnUiThread { renderCatalog() }
            "Loaded ${catalog.size} POS item(s)."
        }
    }

    private fun checkShift() {
        val currentSession = requireSession() ?: return
        val terminalId = terminalInput.text.toString().trim()
        if (terminalId.isBlank()) {
            setStatus("Terminal ID is required.")
            return
        }
        runBackground("Checking shift...") {
            activeShift = apiClient.fetchCurrentShift(
                apiBaseUrl = apiBaseInput.text.toString(),
                session = currentSession,
                terminalId = terminalId
            )
            activeShift?.let { "Shift open: #${it.shiftId} (${it.status})." }
                ?: "No open shift found for $terminalId."
        }
    }

    private fun openShift() {
        val currentSession = requireSession() ?: return
        val terminalId = terminalInput.text.toString().trim()
        if (terminalId.isBlank()) {
            setStatus("Terminal ID is required.")
            return
        }
        runBackground("Opening shift...") {
            activeShift = apiClient.openShift(
                apiBaseUrl = apiBaseInput.text.toString(),
                session = currentSession,
                terminalId = terminalId
            )
            activeShift?.let { "Shift opened: #${it.shiftId}." }
                ?: "Open shift returned no shift payload."
        }
    }

    private fun confirmCheckout() {
        if (cart.isEmpty()) {
            setStatus("Add at least one item before checkout.")
            return
        }
        val total = cartTotal()
        AlertDialog.Builder(this)
            .setTitle("Confirm checkout")
            .setMessage("Total due: PHP ${money(total)}\n\nConfirm sale and open the cash drawer?")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Confirm") { _, _ -> checkout() }
            .show()
    }

    private fun checkout() {
        val terminalId = terminalInput.text.toString().trim()
        if (terminalId.isBlank()) {
            setStatus("Terminal ID is required.")
            return
        }
        val checkoutLines = cart.toList()
        runBackground("Processing native checkout...") {
            val currentSession = session
            if (currentSession == null || currentSession.token.isBlank()) {
                val sale = queueOfflineSale(terminalId, checkoutLines)
                val printResult = drawerController.printReceipt(sale.receiptText, openDrawerAfterPrint = true)
                runOnUiThread {
                    cart.clear()
                    renderCart()
                }
                return@runBackground "Offline sale queued: ${sale.invoiceNumber}. Print/drawer: ${printResult.message}"
            }

            val result = try {
                apiClient.checkout(
                    apiBaseUrl = apiBaseInput.text.toString(),
                    session = currentSession,
                    terminalId = terminalId,
                    shiftId = activeShift?.shiftId,
                    cartLines = checkoutLines,
                    idempotencyKey = offlineIdempotencyKey()
                )
            } catch (exception: Exception) {
                val sale = queueOfflineSale(terminalId, checkoutLines)
                val printResult = drawerController.printReceipt(sale.receiptText, openDrawerAfterPrint = true)
                runOnUiThread {
                    cart.clear()
                    renderCart()
                }
                return@runBackground "Backend unavailable. Offline sale queued: ${sale.invoiceNumber}. Print/drawer: ${printResult.message}"
            }
            val printResult = drawerController.printReceipt(result.receiptText, openDrawerAfterPrint = true)
            runOnUiThread {
                cart.clear()
                renderCart()
                loadHistory()
            }
            "Checkout saved: ${result.invoiceNumber}, PHP ${money(result.totalAmount)}. Print/drawer: ${printResult.message}"
        }
    }

    private fun loadOfflineCache() {
        restoreOfflineState()
        renderCatalog()
        setStatus("Loaded offline cache. Catalog: ${catalog.size}. Offline queue: ${offlineQueueCount()}.")
    }

    private fun syncOfflineSales() {
        val currentSession = requireSession() ?: return
        val terminalId = terminalInput.text.toString().trim()
        if (terminalId.isBlank()) {
            setStatus("Terminal ID is required.")
            return
        }
        runBackground("Syncing offline sales...") {
            val queue = readOfflineQueue()
            if (queue.isEmpty()) {
                return@runBackground "No offline sales to sync."
            }

            val remaining = mutableListOf<OfflineSale>()
            var synced = 0
            queue.forEach { sale ->
                try {
                    apiClient.checkout(
                        apiBaseUrl = apiBaseInput.text.toString(),
                        session = currentSession,
                        terminalId = sale.terminalId.ifBlank { terminalId },
                        shiftId = sale.shiftId ?: activeShift?.shiftId,
                        cartLines = sale.lines,
                        idempotencyKey = sale.idempotencyKey
                    )
                    synced += 1
                } catch (exception: Exception) {
                    remaining.add(sale)
                }
            }
            saveOfflineQueue(remaining)
            runOnUiThread { loadHistory() }
            "Offline sync complete. Synced: $synced. Remaining: ${remaining.size}."
        }
    }

    private fun loadHistory() {
        val currentSession = requireSession() ?: return
        runBackground("Loading receipt history...") {
            transactions = apiClient.fetchTransactions(
                apiBaseUrl = apiBaseInput.text.toString(),
                session = currentSession,
                limit = 12
            )
            runOnUiThread { renderHistory() }
            "Loaded ${transactions.size} receipt(s)."
        }
    }

    private fun printTestReceipt() {
        val result = drawerController.printReceipt(testReceiptText(), openDrawerAfterPrint = false)
        setStatus(result.message)
    }

    private fun openDrawerOnly() {
        val result = drawerController.openCashDrawer()
        setStatus(result.message)
    }

    private fun printAndOpenDrawer() {
        val result = drawerController.printReceipt(testReceiptText(), openDrawerAfterPrint = true)
        setStatus(result.message)
    }

    private fun testDrawerPulse(label: String, bytes: ByteArray) {
        val result = drawerController.testBluetoothDrawerPulse(label, bytes)
        setStatus("Pulse $label: ${result.message}")
    }

    private fun showDiagnostics() {
        AlertDialog.Builder(this)
            .setTitle("Hardware diagnostics")
            .setMessage(drawerController.diagnosticsJson().toString(2))
            .setPositiveButton("OK", null)
            .show()
    }

    private fun showStartupModalTest() {
        if (isFinishing || isDestroyed) return
        AlertDialog.Builder(this)
            .setTitle("Modal test")
            .setMessage("Native popup modal is working on this APK.")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun renderCatalog() {
        catalogContainer.removeAllViews()
        if (catalog.isEmpty()) {
            catalogContainer.addView(emptyText("No catalog loaded."))
            return
        }
        catalog.forEach { item ->
            catalogContainer.addView(itemRow(item))
        }
    }

    private fun renderCart() {
        cartContainer.removeAllViews()
        if (cart.isEmpty()) {
            cartContainer.addView(emptyText("No item in cart."))
        } else {
            cart.forEach { line ->
                cartContainer.addView(cartRow(line))
            }
        }
        if (::totalText.isInitialized) {
            totalText.text = "PHP ${money(cartTotal())}"
        }
    }

    private fun renderHistory() {
        historyContainer.removeAllViews()
        if (transactions.isEmpty()) {
            historyContainer.addView(emptyText("No receipt history loaded."))
            return
        }
        transactions.forEach { transaction ->
            historyContainer.addView(transactionRow(transaction))
        }
    }

    private fun itemRow(item: NativePosApiClient.CatalogItem): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(8))

            addView(LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, wrap(), 1f)
                addView(TextView(context).apply {
                    text = item.name
                    setTextColor(PALETTE_TEXT)
                    textSize = 16f
                    typeface = Typeface.DEFAULT_BOLD
                })
                addView(TextView(context).apply {
                    text = "PHP ${money(item.defaultSalePrice)} ${item.unitOfMeasure}".trim()
                    setTextColor(PALETTE_MUTED)
                    textSize = 13f
                })
            })

            addView(Button(context).apply {
                text = "+"
                textSize = 20f
                setTextColor(Color.WHITE)
                background = rounded(PALETTE_PRIMARY, 8)
                setOnClickListener {
                    addToCart(item)
                }
            })
        }
    }

    private fun cartRow(line: NativeCartLine): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(7), 0, dp(7))
            addView(TextView(context).apply {
                text = "${line.item.name}\nx${formatQuantity(line.quantity)} PHP ${money(line.item.defaultSalePrice * line.quantity)}"
                setTextColor(PALETTE_TEXT)
                textSize = 14f
                layoutParams = LinearLayout.LayoutParams(0, wrap(), 1f)
            })
            addView(Button(context).apply {
                text = "-"
                setTextColor(Color.WHITE)
                background = rounded(PALETTE_DANGER, 8)
                setOnClickListener { removeFromCart(line.item.itemId) }
            })
        }
    }

    private fun transactionRow(transaction: NativePosApiClient.TransactionSummary): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(8))
            addView(TextView(context).apply {
                text = "${transaction.invoiceNumber}\nPHP ${money(transaction.totalAmount)} ${transaction.status}".trim()
                setTextColor(PALETTE_TEXT)
                textSize = 14f
                layoutParams = LinearLayout.LayoutParams(0, wrap(), 1f)
            })
            addView(Button(context).apply {
                text = "View"
                setTextColor(Color.WHITE)
                background = rounded(PALETTE_PRIMARY, 8)
                layoutParams = LinearLayout.LayoutParams(dp(95), dp(44)).apply {
                    marginEnd = dp(8)
                }
                setOnClickListener { viewReceipt(transaction.transactionId) }
            })
            addView(Button(context).apply {
                text = "Print"
                setTextColor(Color.WHITE)
                background = rounded(PALETTE_PRIMARY, 8)
                layoutParams = LinearLayout.LayoutParams(dp(95), dp(44))
                setOnClickListener { printHistoryReceipt(transaction.transactionId) }
            })
        }
    }

    private fun viewReceipt(transactionId: Int) {
        val currentSession = requireSession() ?: return
        runBackground("Loading receipt...") {
            val transaction = apiClient.fetchTransactionById(
                apiBaseUrl = apiBaseInput.text.toString(),
                session = currentSession,
                transactionId = transactionId
            )
            runOnUiThread {
                AlertDialog.Builder(this)
                    .setTitle(transaction.invoiceNumber)
                    .setMessage(transaction.receiptText)
                    .setNegativeButton("Close", null)
                    .setPositiveButton("Print") { _, _ ->
                        val result = drawerController.printReceipt(transaction.receiptText, openDrawerAfterPrint = true)
                        setStatus(result.message)
                    }
                    .show()
            }
            "Receipt loaded: ${transaction.invoiceNumber}."
        }
    }

    private fun printHistoryReceipt(transactionId: Int) {
        val currentSession = requireSession() ?: return
        runBackground("Printing receipt...") {
            val transaction = apiClient.fetchTransactionById(
                apiBaseUrl = apiBaseInput.text.toString(),
                session = currentSession,
                transactionId = transactionId
            )
            val result = drawerController.printReceipt(transaction.receiptText, openDrawerAfterPrint = true)
            "Receipt ${transaction.invoiceNumber}: ${result.message}"
        }
    }

    private fun addToCart(item: NativePosApiClient.CatalogItem) {
        val index = cart.indexOfFirst { it.item.itemId == item.itemId }
        if (index >= 0) {
            val existing = cart[index]
            cart[index] = existing.copy(quantity = existing.quantity + 1)
        } else {
            cart.add(NativeCartLine(item = item, quantity = 1.0))
        }
        renderCart()
    }

    private fun removeFromCart(itemId: Int) {
        val index = cart.indexOfFirst { it.item.itemId == itemId }
        if (index < 0) return
        val existing = cart[index]
        if (existing.quantity <= 1.0) {
            cart.removeAt(index)
        } else {
            cart[index] = existing.copy(quantity = existing.quantity - 1)
        }
        renderCart()
    }

    private fun runBackground(workingMessage: String, block: () -> String) {
        setStatus(workingMessage)
        Thread {
            try {
                val result = block()
                runOnUiThread { setStatus(result) }
            } catch (exception: Exception) {
                runOnUiThread { setStatus(exception.message ?: "Native POS operation failed.") }
            }
        }.start()
    }

    private fun requireSession(): NativePosApiClient.Session? {
        val current = session
        if (current == null || current.token.isBlank()) {
            setStatus("Login first before using backend POS APIs.")
            return null
        }
        return current
    }

    private fun restoreInputs() {
        apiBaseInput.setText(prefs.getString("api_base", AppConfig.defaultApiBaseUrl()))
        companyTokenInput.setText(prefs.getString("company_token", ""))
        emailInput.setText(prefs.getString("email", ""))
        terminalInput.setText(prefs.getString("terminal_id", "falcon-1"))
    }

    private fun restoreOfflineState() {
        restoreCachedSession()
        catalog = readCachedCatalog()
        if (::catalogContainer.isInitialized) {
            renderCatalog()
        }
    }

    private fun saveInputs() {
        prefs.edit()
            .putString("api_base", apiBaseInput.text.toString().trim())
            .putString("company_token", companyTokenInput.text.toString().trim())
            .putString("email", emailInput.text.toString().trim())
            .putString("terminal_id", terminalInput.text.toString().trim())
            .apply()
    }

    private fun setStatus(message: String) {
        statusText.text = message
        Toast.makeText(this, message.take(120), Toast.LENGTH_SHORT).show()
    }

    private fun saveSession(nextSession: NativePosApiClient.Session) {
        prefs.edit()
            .putString(KEY_SESSION_TOKEN, nextSession.token)
            .putString(KEY_SESSION_REFRESH, nextSession.refreshToken)
            .putString(KEY_SESSION_COMPANY, nextSession.companyToken)
            .putString(KEY_SESSION_EMAIL, emailInput.text.toString().trim())
            .putLong(KEY_SESSION_SAVED_AT, System.currentTimeMillis())
            .apply()
    }

    private fun restoreCachedSession() {
        val savedAt = prefs.getLong(KEY_SESSION_SAVED_AT, 0L)
        val ageMs = System.currentTimeMillis() - savedAt
        if (savedAt <= 0L || ageMs > OFFLINE_SESSION_MAX_AGE_MS) return
        val token = prefs.getString(KEY_SESSION_TOKEN, "").orEmpty()
        if (token.isBlank()) return
        session = NativePosApiClient.Session(
            token = token,
            refreshToken = prefs.getString(KEY_SESSION_REFRESH, "").orEmpty(),
            companyToken = prefs.getString(KEY_SESSION_COMPANY, companyTokenInput.text.toString()).orEmpty()
        )
    }

    private fun saveCatalog(items: List<NativePosApiClient.CatalogItem>) {
        prefs.edit()
            .putString(KEY_CATALOG, catalogToJson(items).toString())
            .putLong(KEY_CATALOG_SAVED_AT, System.currentTimeMillis())
            .apply()
    }

    private fun readCachedCatalog(): List<NativePosApiClient.CatalogItem> {
        val raw = prefs.getString(KEY_CATALOG, "").orEmpty()
        if (raw.isBlank()) return emptyList()
        return catalogFromJson(JSONArray(raw))
    }

    private fun queueOfflineSale(terminalId: String, lines: List<NativeCartLine>): OfflineSale {
        val invoice = "OFF-${System.currentTimeMillis()}"
        val sale = OfflineSale(
            idempotencyKey = offlineIdempotencyKey(),
            invoiceNumber = invoice,
            terminalId = terminalId,
            shiftId = activeShift?.shiftId,
            createdAt = System.currentTimeMillis(),
            lines = lines,
            receiptText = buildOfflineReceiptText(invoice, lines)
        )
        saveOfflineQueue(readOfflineQueue() + sale)
        return sale
    }

    private fun readOfflineQueue(): List<OfflineSale> {
        val raw = prefs.getString(KEY_OFFLINE_QUEUE, "").orEmpty()
        if (raw.isBlank()) return emptyList()
        val array = JSONArray(raw)
        return (0 until array.length()).mapNotNull { index ->
            val item = array.optJSONObject(index) ?: return@mapNotNull null
            OfflineSale(
                idempotencyKey = item.optString("idempotency_key"),
                invoiceNumber = item.optString("invoice_number"),
                terminalId = item.optString("terminal_id"),
                shiftId = item.optInt("shift_id", 0).takeIf { it > 0 },
                createdAt = item.optLong("created_at", 0L),
                lines = cartLinesFromJson(item.optJSONArray("lines") ?: JSONArray()),
                receiptText = item.optString("receipt_text")
            )
        }
    }

    private fun saveOfflineQueue(queue: List<OfflineSale>) {
        val array = JSONArray()
        queue.forEach { sale ->
            array.put(
                JSONObject()
                    .put("idempotency_key", sale.idempotencyKey)
                    .put("invoice_number", sale.invoiceNumber)
                    .put("terminal_id", sale.terminalId)
                    .put("shift_id", sale.shiftId ?: JSONObject.NULL)
                    .put("created_at", sale.createdAt)
                    .put("lines", cartLinesToJson(sale.lines))
                    .put("receipt_text", sale.receiptText)
            )
        }
        prefs.edit().putString(KEY_OFFLINE_QUEUE, array.toString()).apply()
    }

    private fun offlineQueueCount(): Int = readOfflineQueue().size

    private fun catalogToJson(items: List<NativePosApiClient.CatalogItem>): JSONArray {
        val array = JSONArray()
        items.forEach { item ->
            array.put(
                JSONObject()
                    .put("item_id", item.itemId)
                    .put("name", item.name)
                    .put("sku_code", item.skuCode)
                    .put("category", item.category)
                    .put("unit_of_measure", item.unitOfMeasure)
                    .put("default_sale_price", item.defaultSalePrice)
                    .put("available_stock", item.availableStock ?: JSONObject.NULL)
            )
        }
        return array
    }

    private fun catalogFromJson(array: JSONArray): List<NativePosApiClient.CatalogItem> {
        return (0 until array.length()).mapNotNull { index ->
            val item = array.optJSONObject(index) ?: return@mapNotNull null
            val itemId = item.optInt("item_id", 0)
            if (itemId <= 0) return@mapNotNull null
            NativePosApiClient.CatalogItem(
                itemId = itemId,
                name = item.optString("name", "Item $itemId"),
                skuCode = item.optString("sku_code", ""),
                category = item.optString("category", ""),
                unitOfMeasure = item.optString("unit_of_measure", ""),
                defaultSalePrice = item.optDouble("default_sale_price", 0.0),
                availableStock = item.optDouble("available_stock", Double.NaN).takeIf { !it.isNaN() }
            )
        }
    }

    private fun cartLinesToJson(lines: List<NativeCartLine>): JSONArray {
        val array = JSONArray()
        lines.forEach { line ->
            array.put(
                JSONObject()
                    .put("quantity", line.quantity)
                    .put("item", catalogToJson(listOf(line.item)).optJSONObject(0))
            )
        }
        return array
    }

    private fun cartLinesFromJson(array: JSONArray): List<NativeCartLine> {
        return (0 until array.length()).mapNotNull { index ->
            val row = array.optJSONObject(index) ?: return@mapNotNull null
            val item = catalogFromJson(JSONArray().put(row.optJSONObject("item") ?: JSONObject())).firstOrNull()
                ?: return@mapNotNull null
            NativeCartLine(item = item, quantity = row.optDouble("quantity", 1.0))
        }
    }

    private fun buildOfflineReceiptText(invoice: String, lines: List<NativeCartLine>): String {
        val total = lines.sumOf { it.item.defaultSalePrice * it.quantity }
        val body = lines.joinToString("\n") {
            "${it.item.name.take(18)} x${formatQuantity(it.quantity)}\n  PHP ${money(it.item.defaultSalePrice * it.quantity)}"
        }
        return """
            DGFY POS
            $invoice
            OFFLINE SALE - PENDING SYNC
            ------------------------------
            $body
            ------------------------------
            TOTAL PHP ${money(total)}

            Sync this sale when online.
        """.trimIndent()
    }

    private fun offlineIdempotencyKey(): String = "native-offline-${UUID.randomUUID()}"

    private fun testReceiptText(): String {
        return """
            DGFY POS
            Native iMin Test
            ------------------------------
            Printer and drawer test
            Device: ${Build.MODEL}
            ------------------------------
            Thank you.
        """.trimIndent()
    }

    private fun cartTotal(): Double = cart.sumOf { it.item.defaultSalePrice * it.quantity }

    private fun panel(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(14), dp(14), dp(14))
            background = rounded(Color.WHITE, 8, PALETTE_BORDER)
        }
    }

    private fun sectionTitle(textValue: String): TextView {
        return TextView(this).apply {
            text = textValue
            setTextColor(PALETTE_TEXT)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, dp(8))
        }
    }

    private fun input(hintValue: String, inputTypeValue: Int): EditText {
        return EditText(this).apply {
            hint = hintValue
            inputType = inputTypeValue
            textSize = 14f
            setSingleLine(true)
            setPadding(dp(12), 0, dp(12), 0)
            background = rounded(Color.WHITE, 8, PALETTE_BORDER)
            layoutParams = LinearLayout.LayoutParams(match(), dp(46)).apply {
                bottomMargin = dp(8)
            }
        }
    }

    private fun actionButton(textValue: String, action: () -> Unit): Button {
        return Button(this).apply {
            text = textValue
            setTextColor(Color.WHITE)
            textSize = 13f
            minHeight = dp(52)
            setPadding(dp(8), 0, dp(8), 0)
            gravity = Gravity.CENTER
            background = rounded(PALETTE_PRIMARY, 8)
            setOnClickListener { action() }
        }
    }

    private fun row(left: View, right: View): LinearLayout {
        return LinearLayout(this).apply {
            orientation = if (compactBridgeLayout) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(match(), wrap()).apply {
                bottomMargin = if (compactBridgeLayout) dp(8) else 0
            }
            if (compactBridgeLayout) {
                left.layoutParams = LinearLayout.LayoutParams(match(), dp(52)).apply {
                    bottomMargin = dp(8)
                }
                right.layoutParams = LinearLayout.LayoutParams(match(), dp(52))
            } else {
                left.layoutParams = LinearLayout.LayoutParams(0, dp(52), 1f).apply {
                    marginEnd = dp(6)
                }
                right.layoutParams = LinearLayout.LayoutParams(0, dp(52), 1f).apply {
                    marginStart = dp(6)
                }
            }
            addView(left)
            addView(right)
        }
    }

    private fun emptyText(textValue: String): TextView {
        return TextView(this).apply {
            text = textValue
            setTextColor(PALETTE_MUTED)
            textSize = 14f
            setPadding(0, dp(10), 0, dp(10))
        }
    }

    private fun space(height: Int): Space {
        return Space(this).apply {
            layoutParams = FrameLayout.LayoutParams(match(), dp(height))
        }
    }

    private fun rounded(color: Int, radiusDp: Int, strokeColor: Int? = null): GradientDrawable {
        return GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radiusDp).toFloat()
            if (strokeColor != null) setStroke(dp(1), strokeColor)
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

    private fun money(value: Double): String = String.format("%.2f", value)

    private fun formatQuantity(value: Double): String {
        return if (value % 1.0 == 0.0) value.toInt().toString() else String.format("%.2f", value)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun match(): Int = ViewGroup.LayoutParams.MATCH_PARENT

    private fun wrap(): Int = ViewGroup.LayoutParams.WRAP_CONTENT

    companion object {
        private const val BLUETOOTH_PERMISSION_REQUEST_CODE = 7001
        private const val PALETTE_BG = 0xFFF1F5F9.toInt()
        private const val PALETTE_TEXT = 0xFF0F172A.toInt()
        private const val PALETTE_MUTED = 0xFF64748B.toInt()
        private const val PALETTE_PRIMARY = 0xFF1D4ED8.toInt()
        private const val PALETTE_DANGER = 0xFFDC2626.toInt()
        private const val PALETTE_BORDER = 0xFFE2E8F0.toInt()
        private const val KEY_SESSION_TOKEN = "offline_session_token"
        private const val KEY_SESSION_REFRESH = "offline_session_refresh"
        private const val KEY_SESSION_COMPANY = "offline_session_company"
        private const val KEY_SESSION_EMAIL = "offline_session_email"
        private const val KEY_SESSION_SAVED_AT = "offline_session_saved_at"
        private const val KEY_CATALOG = "offline_catalog_json"
        private const val KEY_CATALOG_SAVED_AT = "offline_catalog_saved_at"
        private const val KEY_OFFLINE_QUEUE = "offline_sales_queue_json"
        private const val OFFLINE_SESSION_MAX_AGE_MS = 72L * 60L * 60L * 1000L
    }
}

private data class OfflineSale(
    val idempotencyKey: String,
    val invoiceNumber: String,
    val terminalId: String,
    val shiftId: Int?,
    val createdAt: Long,
    val lines: List<NativeCartLine>,
    val receiptText: String
)
