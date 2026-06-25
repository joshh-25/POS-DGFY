package com.dgfy.standalonepos

import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class StandalonePosPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        Log.i("StandalonePosStartup", "StandalonePosPackage.createNativeModules start")
        val modules = listOf(
            StandalonePosHardwareModule(reactContext),
            StandalonePosSqliteModule(reactContext),
            StandalonePosSyncModule(reactContext)
        )
        Log.i("StandalonePosStartup", "StandalonePosPackage.createNativeModules done")
        return modules
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
