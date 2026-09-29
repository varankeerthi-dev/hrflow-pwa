# Android project setup

Open `native-android/` as a standalone Android Studio project; do not open or regenerate the existing top-level `android/` Capacitor wrapper for this native app. Install JDK 17 or newer and Android SDK Platform 36. The project pins Android Gradle Plugin 8.13.2 with Gradle 8.13 and Kotlin/Compose compiler plugins 2.4.20. Android Studio can use the included Gradle wrapper after it is generated/checked in; no `local.properties`, SDK path, signing key, or Firebase file belongs in source control.

## Choose the final app identity first

The starter uses namespace `com.example.hrflow`; unless overridden, its application ID defaults to the same `com.example.hrflow` string purely so the source project has a buildable placeholder. It is **not** a confirmed HRFlow package ID and must not be registered in Firebase or shipped. Pick the long-lived production application ID before creating the Android Firebase app; application IDs are hard to change after Firebase/App Store/Play integrations begin.

Pass the chosen ID to Gradle with `-PhrflowApplicationId=your.final.id` or place `hrflowApplicationId=your.final.id` in the user's global Gradle properties, not in a committed file. For example:

```bash
./gradlew -PhrflowApplicationId=your.final.id :app:assembleDebug
```

The Kotlin namespace remains `com.example.hrflow` for this foundation; changing the Android `applicationId` does not require moving the source packages, but update the namespace deliberately if the team chooses to align both.

## Register and configure Firebase

In the **existing HRFlow Firebase project**, add an Android app with the final application ID and download that app's own `google-services.json`. The repository contains web Firebase configuration but no native Android registration file, Android Firebase app ID, or verified final package ID; a web API key/config cannot stand in for an Android registration. Put the downloaded file at `native-android/app/google-services.json`. It is ignored by this project's `.gitignore` and should remain local. Do not add service-account credentials, Admin SDK secrets, or signing files to the Android client.

The app module only applies the Google Services plugin when that file is present. With no app configuration, launch stops at “Android setup required” before Auth or Firestore is requested. With configuration present, confirm that Firebase Authentication's Email/Password provider is enabled in the same project. If Google or phone sign-in is later added, register the required SHA fingerprints and provider config as a separate, reviewed change. Firebase's [Android setup guide](https://firebase.google.com/docs/android/setup) explains app registration and config placement.

No new indexes, Firestore/Storage rule changes, collections, or Firebase project writes are made by this branch. Before connecting organization data, review the repository's current rules: signed-in status alone currently permits broad reads of `users/{userId}` and generic organization documents/subcollections. Do not use UI permissions as a safety barrier for real data.

## Build and test

After Android Studio installs API 36 and resolves dependencies, use the wrapper from `native-android/`:

```bash
./gradlew -PhrflowApplicationId=your.final.id :app:assembleDebug
./gradlew -PhrflowApplicationId=your.final.id :app:testDebugUnitTest
```

Open the same project in Android Studio to create/launch an emulator or attach a physical Android device. The implementation computer had OpenJDK 21 but no Android SDK, `adb`, `sdkmanager`, or system Gradle; therefore runtime/build validation must be completed on a machine with the SDK, and this environment cannot produce a verified APK. See [performance validation](PERFORMANCE.md) before using a device run as a release benchmark.

The build currently includes unit-test support via JUnit 4.13.2 and a pure mapper test. UI tests, screenshot automation, Firebase Emulator Suite rules tests, Macrobenchmark module/dependencies, Baseline Profile generation, and release signing are intentionally not wired yet; add them when a real registered app and representative app journeys are available.
