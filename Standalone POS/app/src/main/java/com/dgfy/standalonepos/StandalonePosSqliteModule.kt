package com.dgfy.standalonepos

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class StandalonePosSqliteModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    private val databaseHelper = StandalonePosDatabaseHelper(reactContext)
    private val transactions = ConcurrentHashMap<String, SQLiteDatabase>()

    override fun getName(): String = "StandalonePosSqlite"

    @ReactMethod
    fun initialize(promise: Promise) {
        try {
            databaseHelper.writableDatabase
            promise.resolve(true)
        } catch (exception: Exception) {
            promise.reject("SQLITE_INIT_FAILED", exception.message, exception)
        }
    }

    @ReactMethod
    fun beginTransaction(promise: Promise) {
        try {
            val id = "tx-${UUID.randomUUID()}"
            val db = databaseHelper.writableDatabase
            db.beginTransactionNonExclusive()
            transactions[id] = db
            promise.resolve(id)
        } catch (exception: Exception) {
            promise.reject("SQLITE_BEGIN_TRANSACTION_FAILED", exception.message, exception)
        }
    }

    @ReactMethod
    fun commitTransaction(transactionId: String, promise: Promise) {
        try {
            val db = requireTransaction(transactionId)
            db.setTransactionSuccessful()
            db.endTransaction()
            transactions.remove(transactionId)
            promise.resolve(true)
        } catch (exception: Exception) {
            promise.reject("SQLITE_COMMIT_TRANSACTION_FAILED", exception.message, exception)
        }
    }

    @ReactMethod
    fun rollbackTransaction(transactionId: String, promise: Promise) {
        try {
            val db = requireTransaction(transactionId)
            if (db.inTransaction()) {
                db.endTransaction()
            }
            transactions.remove(transactionId)
            promise.resolve(true)
        } catch (exception: Exception) {
            promise.reject("SQLITE_ROLLBACK_TRANSACTION_FAILED", exception.message, exception)
        }
    }

    @ReactMethod
    fun execute(sql: String, params: ReadableArray?, transactionId: String?, promise: Promise) {
        try {
            val db = resolveDatabase(transactionId)
            db.compileStatement(sql).use { statement ->
                bindParams(statement, params)
                statement.execute()
            }
            promise.resolve(true)
        } catch (exception: Exception) {
            promise.reject("SQLITE_EXECUTE_FAILED", exception.message, exception)
        }
    }

    @ReactMethod
    fun query(sql: String, params: ReadableArray?, transactionId: String?, promise: Promise) {
        try {
            val db = resolveDatabase(transactionId)
            val args = toStringArgs(params)
            val cursor = db.rawQuery(sql, args)
            cursor.use {
                promise.resolve(cursorToWritableArray(it))
            }
        } catch (exception: Exception) {
            promise.reject("SQLITE_QUERY_FAILED", exception.message, exception)
        }
    }

    private fun resolveDatabase(transactionId: String?): SQLiteDatabase {
        return if (transactionId.isNullOrBlank()) {
            databaseHelper.writableDatabase
        } else {
            requireTransaction(transactionId)
        }
    }

    private fun requireTransaction(transactionId: String): SQLiteDatabase {
        return transactions[transactionId]
            ?: throw IllegalStateException("SQLite transaction $transactionId is not active")
    }

    private fun bindParams(statement: android.database.sqlite.SQLiteStatement, params: ReadableArray?) {
        if (params == null) {
            return
        }

        for (index in 0 until params.size()) {
            val bindIndex = index + 1
            when (params.getType(index)) {
                ReadableType.Null -> statement.bindNull(bindIndex)
                ReadableType.Boolean -> statement.bindLong(bindIndex, if (params.getBoolean(index)) 1L else 0L)
                ReadableType.Number -> statement.bindDouble(bindIndex, params.getDouble(index))
                ReadableType.String -> statement.bindString(bindIndex, params.getString(index) ?: "")
                else -> statement.bindString(bindIndex, params.getDynamic(index).asString())
            }
        }
    }

    private fun toStringArgs(params: ReadableArray?): Array<String>? {
        if (params == null) {
            return null
        }

        return Array(params.size()) { index ->
            when (params.getType(index)) {
                ReadableType.Null -> ""
                ReadableType.Boolean -> if (params.getBoolean(index)) "1" else "0"
                ReadableType.Number -> {
                    val value = params.getDouble(index)
                    if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()
                }
                ReadableType.String -> params.getString(index) ?: ""
                else -> params.getDynamic(index).asString()
            }
        }
    }

    private fun cursorToWritableArray(cursor: Cursor): WritableArray {
        val rows = Arguments.createArray()
        val columnNames = cursor.columnNames

        while (cursor.moveToNext()) {
            val row = Arguments.createMap()
            columnNames.forEachIndexed { index, columnName ->
                when (cursor.getType(index)) {
                    Cursor.FIELD_TYPE_NULL -> row.putNull(columnName)
                    Cursor.FIELD_TYPE_INTEGER -> row.putDouble(columnName, cursor.getLong(index).toDouble())
                    Cursor.FIELD_TYPE_FLOAT -> row.putDouble(columnName, cursor.getDouble(index))
                    Cursor.FIELD_TYPE_STRING -> row.putString(columnName, cursor.getString(index))
                    Cursor.FIELD_TYPE_BLOB -> row.putString(columnName, String(cursor.getBlob(index)))
                    else -> row.putString(columnName, cursor.getString(index))
                }
            }
            rows.pushMap(row)
        }

        return rows
    }

    private class StandalonePosDatabaseHelper(context: ReactApplicationContext) :
        SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {
        override fun onCreate(db: SQLiteDatabase) = Unit
        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

        companion object {
            private const val DATABASE_NAME = "standalone_pos.db"
            private const val DATABASE_VERSION = 1
        }
    }
}
