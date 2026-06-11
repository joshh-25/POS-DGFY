package com.dgfy.iminwrapper

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID

class NativePosApiClient {
    data class Session(
        val token: String,
        val refreshToken: String,
        val companyToken: String
    )

    data class CatalogItem(
        val itemId: Int,
        val name: String,
        val skuCode: String,
        val category: String,
        val unitOfMeasure: String,
        val defaultSalePrice: Double,
        val availableStock: Double?
    )

    data class Shift(
        val shiftId: Int,
        val status: String,
        val terminalId: String
    )

    data class CheckoutResult(
        val transactionId: Int?,
        val invoiceNumber: String,
        val totalAmount: Double,
        val receiptText: String
    )

    data class TransactionSummary(
        val transactionId: Int,
        val invoiceNumber: String,
        val totalAmount: Double,
        val status: String,
        val createdAt: String,
        val receiptText: String
    )

    fun login(
        apiBaseUrl: String,
        companyToken: String,
        email: String,
        password: String
    ): Session {
        val body = JSONObject()
            .put("email", email.trim())
            .put("password", password)

        val response = request(
            method = "POST",
            url = "${normalizeApiBase(apiBaseUrl)}/auth/login",
            body = body,
            companyToken = companyToken.trim()
        )
        val data = response.optJSONObject("data") ?: JSONObject()
        return Session(
            token = data.optString("token"),
            refreshToken = data.optString("refreshToken"),
            companyToken = companyToken.trim()
        )
    }

    fun fetchCatalog(
        apiBaseUrl: String,
        session: Session,
        search: String = "",
        limit: Int = 80
    ): List<CatalogItem> {
        val query = "search=${encode(search)}&limit=$limit"
        val response = request(
            method = "GET",
            url = "${normalizeApiBase(apiBaseUrl)}/pos/catalog?$query",
            session = session
        )
        val data = response.opt("data")
        val rows = when (data) {
            is JSONArray -> data
            is JSONObject -> data.optJSONArray("rows")
                ?: data.optJSONArray("items")
                ?: data.optJSONArray("catalog")
                ?: JSONArray()
            else -> JSONArray()
        }

        return (0 until rows.length()).mapNotNull { index ->
            val item = rows.optJSONObject(index) ?: return@mapNotNull null
            val itemId = item.optInt("item_id", 0)
            if (itemId <= 0) return@mapNotNull null
            CatalogItem(
                itemId = itemId,
                name = item.optString("name", "Item $itemId"),
                skuCode = item.optString("sku_code", ""),
                category = item.optString("category", ""),
                unitOfMeasure = item.optString("unit_of_measure", ""),
                defaultSalePrice = item.optDouble("default_sale_price", 0.0),
                availableStock = readOptionalDouble(item, "available_stock")
                    ?: readOptionalDouble(item, "current_stock")
                    ?: readOptionalDouble(item, "quantity_on_hand")
            )
        }
    }

    fun fetchCurrentShift(
        apiBaseUrl: String,
        session: Session,
        terminalId: String
    ): Shift? {
        val response = request(
            method = "GET",
            url = "${normalizeApiBase(apiBaseUrl)}/pos/terminal/shifts/current?terminal_id=${encode(terminalId)}",
            session = session
        )
        val data = response.optJSONObject("data") ?: return null
        return parseShift(data)
    }

    fun openShift(
        apiBaseUrl: String,
        session: Session,
        terminalId: String
    ): Shift? {
        val body = JSONObject()
            .put("idempotency_key", idempotencyKey("native-shift"))
            .put("terminal_id", terminalId)
            .put("opening_float_amount", 0)
        val response = request(
            method = "POST",
            url = "${normalizeApiBase(apiBaseUrl)}/pos/terminal/shifts/open",
            body = body,
            session = session
        )
        val data = response.optJSONObject("data") ?: return null
        return parseShift(data.optJSONObject("shift") ?: data)
    }

    fun checkout(
        apiBaseUrl: String,
        session: Session,
        terminalId: String,
        shiftId: Int?,
        cartLines: List<NativeCartLine>,
        idempotencyKey: String? = null
    ): CheckoutResult {
        val lines = JSONArray()
        cartLines.forEach { line ->
            lines.put(
                JSONObject()
                    .put("item_id", line.item.itemId)
                    .put("quantity", line.quantity)
                    .put("sale_price", line.item.defaultSalePrice)
            )
        }

        val body = JSONObject()
            .put("idempotency_key", idempotencyKey ?: idempotencyKey("native-checkout"))
            .put("terminal_id", terminalId)
            .put("order_method", "dine_in")
            .put("payment_type", "cash")
            .put("payment_handoff_mode", "internal")
            .put("discount_amount", 0)
            .put("lines", lines)

        if (shiftId != null && shiftId > 0) {
            body.put("shift_id", shiftId)
        }

        val response = request(
            method = "POST",
            url = "${normalizeApiBase(apiBaseUrl)}/pos/checkouts",
            body = body,
            session = session
        )
        val data = response.optJSONObject("data") ?: JSONObject()
        val transaction = data.optJSONObject("transaction") ?: data
        val transactionId = transaction.optInt("pos_transaction_id", 0).takeIf { it > 0 }
        val invoice = transaction.optString("invoice_number", transactionId?.let { "POS-$it" } ?: "Native sale")
        val total = readOptionalDouble(transaction, "total_amount")
            ?: readOptionalDouble(transaction, "grand_total")
            ?: cartLines.sumOf { it.quantity * it.item.defaultSalePrice }

        return CheckoutResult(
            transactionId = transactionId,
            invoiceNumber = invoice,
            totalAmount = total,
            receiptText = buildCartReceiptText(invoice, cartLines, total)
        )
    }

    fun fetchTransactions(
        apiBaseUrl: String,
        session: Session,
        limit: Int = 10
    ): List<TransactionSummary> {
        val response = request(
            method = "GET",
            url = "${normalizeApiBase(apiBaseUrl)}/pos/transactions?limit=$limit",
            session = session
        )
        val data = response.optJSONObject("data") ?: JSONObject()
        val rows = data.optJSONArray("transactions")
            ?: data.optJSONArray("rows")
            ?: data.optJSONArray("items")
            ?: JSONArray()
        return (0 until rows.length()).mapNotNull { index ->
            parseTransaction(rows.optJSONObject(index) ?: return@mapNotNull null, includeFallbackLines = false)
        }
    }

    fun fetchTransactionById(
        apiBaseUrl: String,
        session: Session,
        transactionId: Int
    ): TransactionSummary {
        val response = request(
            method = "GET",
            url = "${normalizeApiBase(apiBaseUrl)}/pos/transactions/$transactionId",
            session = session
        )
        val data = response.optJSONObject("data") ?: JSONObject()
        return parseTransaction(data.optJSONObject("transaction") ?: data, includeFallbackLines = true)
            ?: throw IllegalStateException("Receipt not found.")
    }

    private fun parseShift(data: JSONObject): Shift? {
        val shiftId = data.optInt("pos_terminal_shift_id", data.optInt("shift_id", 0))
        if (shiftId <= 0) return null
        return Shift(
            shiftId = shiftId,
            status = data.optString("status", ""),
            terminalId = data.optString("terminal_id", "")
        )
    }

    private fun request(
        method: String,
        url: String,
        body: JSONObject? = null,
        session: Session? = null,
        companyToken: String? = null
    ): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            session?.token?.takeIf { it.isNotBlank() }?.let {
                setRequestProperty("Authorization", "Bearer $it")
            }
            val tenantToken = companyToken?.takeIf { it.isNotBlank() } ?: session?.companyToken
            tenantToken?.takeIf { it.isNotBlank() }?.let {
                setRequestProperty("x-company-token", it)
            }
            if (body != null) {
                doOutput = true
            }
        }

        if (body != null) {
            OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { writer ->
                writer.write(body.toString())
            }
        }

        val statusCode = connection.responseCode
        val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
        val payload = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
        val json = if (payload.isBlank()) JSONObject() else JSONObject(payload)

        if (statusCode !in 200..299) {
            val message = json.optString("message", "HTTP $statusCode")
            throw IllegalStateException(message)
        }

        return json
    }

    private fun parseTransaction(
        transaction: JSONObject,
        includeFallbackLines: Boolean
    ): TransactionSummary? {
        val transactionId = transaction.optInt("pos_transaction_id", transaction.optInt("id", 0))
        if (transactionId <= 0) return null
        val invoice = transaction.optString("invoice_number", "POS-$transactionId")
        val total = readOptionalDouble(transaction, "total_amount")
            ?: readOptionalDouble(transaction, "grand_total")
            ?: 0.0
        return TransactionSummary(
            transactionId = transactionId,
            invoiceNumber = invoice,
            totalAmount = total,
            status = transaction.optString("status", ""),
            createdAt = transaction.optString("created_at", ""),
            receiptText = buildTransactionReceiptText(transaction, invoice, total, includeFallbackLines)
        )
    }

    private fun buildCartReceiptText(invoice: String, cartLines: List<NativeCartLine>, total: Double): String {
        val builder = StringBuilder()
        builder.appendLine("DGFY POS")
        builder.appendLine(invoice)
        builder.appendLine("------------------------------")
        cartLines.forEach { line ->
            builder.appendLine("${line.item.name.take(18)} x${formatQuantity(line.quantity)}")
            builder.appendLine("  PHP ${money(line.item.defaultSalePrice * line.quantity)}")
        }
        builder.appendLine("------------------------------")
        builder.appendLine("TOTAL PHP ${money(total)}")
        builder.appendLine()
        builder.appendLine("Thank you.")
        return builder.toString()
    }

    private fun buildTransactionReceiptText(
        transaction: JSONObject,
        invoice: String,
        total: Double,
        includeFallbackLines: Boolean
    ): String {
        val builder = StringBuilder()
        builder.appendLine("DGFY POS")
        builder.appendLine(invoice)
        transaction.optString("created_at").takeIf { it.isNotBlank() }?.let {
            builder.appendLine(it.take(19).replace('T', ' '))
        }
        builder.appendLine("------------------------------")
        val lines = transaction.optJSONArray("lines") ?: JSONArray()
        if (lines.length() > 0) {
            for (index in 0 until lines.length()) {
                val line = lines.optJSONObject(index) ?: continue
                val item = line.optJSONObject("item") ?: JSONObject()
                val name = item.optString("name", line.optString("item_name", "Item"))
                val quantity = readOptionalDouble(line, "quantity") ?: 1.0
                val salePrice = readOptionalDouble(line, "sale_price")
                    ?: readOptionalDouble(line, "unit_price")
                    ?: 0.0
                builder.appendLine("${name.take(18)} x${formatQuantity(quantity)}")
                builder.appendLine("  PHP ${money(salePrice * quantity)}")
            }
        } else if (includeFallbackLines) {
            builder.appendLine("Saved transaction")
        }
        builder.appendLine("------------------------------")
        builder.appendLine("TOTAL PHP ${money(total)}")
        builder.appendLine()
        builder.appendLine("Thank you.")
        return builder.toString()
    }

    private fun normalizeApiBase(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        return if (trimmed.endsWith("/api/v1")) trimmed else "$trimmed/api/v1"
    }

    private fun encode(value: String): String {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.name())
    }

    private fun idempotencyKey(prefix: String): String {
        return "$prefix-${UUID.randomUUID()}"
    }

    private fun readOptionalDouble(json: JSONObject, key: String): Double? {
        if (!json.has(key) || json.isNull(key)) return null
        return json.optDouble(key, Double.NaN).takeIf { !it.isNaN() }
    }

    private fun money(value: Double): String = String.format("%.2f", value)

    private fun formatQuantity(value: Double): String {
        return if (value % 1.0 == 0.0) value.toInt().toString() else String.format("%.2f", value)
    }
}

data class NativeCartLine(
    val item: NativePosApiClient.CatalogItem,
    val quantity: Double
)
