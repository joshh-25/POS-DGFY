package com.dgfy.standalonepos;

import android.app.Application;
import android.util.Log;

import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactHost;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactHost;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.react.soloader.OpenSourceMergedSoMapping;
import com.facebook.soloader.SoLoader;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {
    private static final String TAG = "StandalonePosStartup";
    private final ReactNativeHost reactNativeHost =
            new DefaultReactNativeHost(this) {
                @Override
                public boolean getUseDeveloperSupport() {
                    return BuildConfig.DEBUG;
                }

                @Override
                protected List<ReactPackage> getPackages() {
                    Log.i(TAG, "ReactNativeHost.getPackages start");
                    List<ReactPackage> packages = new ArrayList<>(new PackageList(this).getPackages());
                    packages.add(new StandalonePosPackage());
                    Log.i(TAG, "ReactNativeHost.getPackages done");
                    return packages;
                }

                @Override
                protected String getJSMainModuleName() {
                    return "index";
                }

                @Override
                protected boolean isNewArchEnabled() {
                    return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
                }

                @Override
                protected Boolean isHermesEnabled() {
                    return BuildConfig.IS_HERMES_ENABLED;
                }
            };

    @Override
    public ReactNativeHost getReactNativeHost() {
        return reactNativeHost;
    }

    @Override
    public ReactHost getReactHost() {
        return DefaultReactHost.getDefaultReactHost(getApplicationContext(), reactNativeHost, null);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "MainApplication.onCreate start");
        try {
            SoLoader.init(this, OpenSourceMergedSoMapping.INSTANCE);
            Log.i(TAG, "SoLoader.init done");
        } catch (IOException exception) {
            throw new RuntimeException("Failed to initialize native libraries", exception);
        }
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            DefaultNewArchitectureEntryPoint.load();
        }
        Log.i(TAG, "MainApplication.onCreate done");
    }
}
