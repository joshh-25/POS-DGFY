// AGP's java-base plugin registers a `java` extension (JavaPluginExtension) on
// this script's implicit Project receiver, which shadows the root `java`
// package -- so `java.net.URI` below would not resolve. Import the bare name
// instead of qualifying it inline.
import java.net.URI

plugins {
    alias(libs.plugins.android.application)
}

// Per-environment POS routing, one entry per product flavor below.
//
// Every value is overridable at build time so a DNS change -- or an
// environment whose subdomain does not follow the pos.<env>.dgfy.ph
// convention -- is a build flag rather than an edit to this file:
//
//   ./gradlew assembleDevRelease -Pdgfy.dev.posOrigin=https://pos.example.ph
//   bash scripts/build-android-release.sh dev --pos-origin https://pos.example.ph
//
// The four names match the platform's four GitHub Environments
// (DEV -> dev.dgfy.ph, STAGING -> stage.dgfy.ph, BETA -> beta.dgfy.ph,
// PROD -> dgfy.ph); see infrastructure/docker/SENTRY.md.
val posOrigins = mapOf(
    "prod" to "https://pos.dgfy.ph",
    "beta" to "https://pos.beta.dgfy.ph",
    "staging" to "https://pos.stage.dgfy.ph",
    "dev" to "https://pos.dev.dgfy.ph"
).mapValues { (flavor, fallback) ->
    (project.findProperty("dgfy.$flavor.posOrigin") as? String)
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?: fallback
}

val skupervisorHosts = mapOf(
    "prod" to "skupervisor.dgfy.ph",
    "beta" to "skupervisor.beta.dgfy.ph",
    "staging" to "skupervisor.stage.dgfy.ph",
    "dev" to "skupervisor.dev.dgfy.ph"
).mapValues { (flavor, fallback) ->
    (project.findProperty("dgfy.$flavor.skupervisorHost") as? String)
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?: fallback
}

// Derived, never typed twice: the WebView's allowed-host check
// (AppConfig.allowedHosts) reads LIVE_POS_HOST, so if it were a separate
// literal a typo would silently block the very origin the app loads.
val posHosts = posOrigins.mapValues { (flavor, origin) ->
    requireNotNull(runCatching { URI(origin).host }.getOrNull()) {
        "dgfy.$flavor.posOrigin is not a valid absolute URL: $origin"
    }
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
        // Declared first so it stays Android Studio's default build variant.
        create("prod") {
            dimension = "environment"
            buildConfigField("String", "LIVE_POS_ORIGIN", "\"${posOrigins["prod"]}\"")
            buildConfigField("String", "LIVE_POS_HOST", "\"${posHosts["prod"]}\"")
            buildConfigField("String", "SKUPERVISOR_HOST", "\"${skupervisorHosts["prod"]}\"")
        }
        create("beta") {
            dimension = "environment"
            applicationIdSuffix = ".beta"
            versionNameSuffix = "-beta"
            buildConfigField("String", "LIVE_POS_ORIGIN", "\"${posOrigins["beta"]}\"")
            buildConfigField("String", "LIVE_POS_HOST", "\"${posHosts["beta"]}\"")
            buildConfigField("String", "SKUPERVISOR_HOST", "\"${skupervisorHosts["beta"]}\"")
        }
        // Points at pos.stage.dgfy.ph -- lets a build off any branch
        // (including a feature branch, via workflow_dispatch's ref picker)
        // be verified on real iMin hardware before it ever reaches `main`.
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".stage"
            versionNameSuffix = "-staging"
            buildConfigField("String", "LIVE_POS_ORIGIN", "\"${posOrigins["staging"]}\"")
            buildConfigField("String", "LIVE_POS_HOST", "\"${posHosts["staging"]}\"")
            buildConfigField("String", "SKUPERVISOR_HOST", "\"${skupervisorHosts["staging"]}\"")
        }
        // Points at pos.dev.dgfy.ph -- the fastest loop for verifying an
        // unmerged branch's hardware behavior on a physical device.
        create("dev") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            buildConfigField("String", "LIVE_POS_ORIGIN", "\"${posOrigins["dev"]}\"")
            buildConfigField("String", "LIVE_POS_HOST", "\"${posHosts["dev"]}\"")
            buildConfigField("String", "SKUPERVISOR_HOST", "\"${skupervisorHosts["dev"]}\"")
        }
    }

    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }

        release {
            manifestPlaceholders += mapOf()
            signingConfig = signingConfigs.getByName("debug")
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            optimization {
                enable = false
            }
        }
    }
    buildFeatures {
        buildConfig = true
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
