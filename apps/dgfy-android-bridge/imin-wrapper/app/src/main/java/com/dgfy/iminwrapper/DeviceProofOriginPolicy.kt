package com.dgfy.iminwrapper

/** Small pure policy boundary for WebMessageListener origin/frame checks. */
object DeviceProofOriginPolicy {
    fun isPermitted(sourceOrigin: String?, isMainFrame: Boolean): Boolean {
        return isMainFrame && AppConfig.isApprovedDeviceProofOrigin(sourceOrigin)
    }
}
