pluginManagement {
    includeBuild("node_modules/@react-native/gradle-plugin")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("com.facebook.react.settings")
}

extensions.configure(com.facebook.react.ReactSettingsExtension::class.java) {
    autolinkLibrariesFromCommand(
        workingDirectory = rootDir,
        lockFiles = files("package-lock.json", "package.json", "react-native.config.js")
    )
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://jitpack.io")
    }
}

rootProject.name = "Standalone POS"
include(":app")
