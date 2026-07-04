plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.dgfy.iminwrapper"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.dgfy.iminwrapper"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        buildConfig = true
    }

    flavorDimensions += "environment"
    productFlavors {
        create("prod") {
            dimension = "environment"
            buildConfigField("String", "LIVE_POS_ORIGIN", "\"https://pos.dgfy.ph\"")
            buildConfigField("String", "LIVE_POS_HOST", "\"pos.dgfy.ph\"")
            buildConfigField("String", "SKUPERVISOR_HOST", "\"skupervisor.dgfy.ph\"")
        }
        create("beta") {
            dimension = "environment"
            applicationIdSuffix = ".beta"
            versionNameSuffix = "-beta"
            buildConfigField("String", "LIVE_POS_ORIGIN", "\"https://pos.beta.dgfy.ph\"")
            buildConfigField("String", "LIVE_POS_HOST", "\"pos.beta.dgfy.ph\"")
            buildConfigField("String", "SKUPERVISOR_HOST", "\"skupervisor.beta.dgfy.ph\"")
        }
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.core.ktx)
    implementation(libs.imin.printer.library)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}
