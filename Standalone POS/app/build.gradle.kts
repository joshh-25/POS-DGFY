plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    id("com.facebook.react")
}

import org.gradle.internal.os.OperatingSystem

react {
    root.set(file(".."))
    reactNativeDir.set(file("../node_modules/react-native"))
    cliFile.set(file("../node_modules/react-native/cli.js"))
    codegenDir.set(file("../node_modules/@react-native/codegen"))
}

android {
    namespace = "com.dgfy.standalonepos"
    compileSdk = 36
    buildToolsVersion = "36.1.0"

    defaultConfig {
        applicationId = "com.dgfy.standalonepos"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("boolean", "IS_NEW_ARCHITECTURE_ENABLED", "false")
        buildConfigField("boolean", "IS_HERMES_ENABLED", "true")
    }

    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }

        release {
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

val bundleOutputFile = layout.projectDirectory.file("src/main/assets/index.android.bundle")
val bundleAssetsDir = layout.projectDirectory.dir("src/main/res")

val bundleStandaloneJs by tasks.registering(Exec::class) {
    group = "react"
    description = "Bundles the standalone POS React Native app for local Android Studio builds."

    workingDir = projectDir.parentFile

    inputs.file(projectDir.parentFile.resolve("index.js"))
    inputs.dir(projectDir.parentFile.resolve("../mobile/hardware-pos/src"))
    outputs.file(bundleOutputFile)

    doFirst {
        bundleOutputFile.asFile.parentFile.mkdirs()
        bundleAssetsDir.asFile.mkdirs()
    }

    val command = listOf(
        "npx",
        "react-native",
        "bundle",
        "--platform",
        "android",
        "--dev",
        "false",
        "--entry-file",
        "index.js",
        "--bundle-output",
        bundleOutputFile.asFile.absolutePath,
        "--assets-dest",
        bundleAssetsDir.asFile.absolutePath,
        "--config",
        projectDir.parentFile.resolve("metro.config.js").absolutePath,
    )

    if (OperatingSystem.current().isWindows) {
        commandLine("cmd", "/c", *command.toTypedArray())
    } else {
        commandLine(command)
    }
}

tasks.named("preBuild") {
    dependsOn(bundleStandaloneJs)
}

dependencies {
    implementation("com.facebook.react:react-android:0.79.6")
    implementation("com.facebook.react:hermes-android:0.79.6")
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.imin.printer.library)
    implementation(libs.material)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}
