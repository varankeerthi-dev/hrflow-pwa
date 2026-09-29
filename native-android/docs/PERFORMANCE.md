# Native performance plan

No performance result has been measured in this branch. Kotlin/Compose is the selected platform, not evidence of a speedup. The initial work therefore limits startup dependencies and Firebase work, gives the UI explicit loading/error states, and defines repeatable targets for the later real-screen implementation.

## Targets and measurement

| Journey | Target | Measurement setup |
| --- | --- | --- |
| Cold launch to first local frame | p50 ≤ 1.8 s; p95 ≤ 2.5 s | At least 30 cold starts on one named mid-range physical phone; release-signed non-debug build; stable OS, battery/thermal state; record exact device and build. |
| Employee list scroll (after directory exists) | p95 frame duration ≤ 16.7 ms and <1% of measured frames >16.7 ms at 60 Hz | Same physical device; fixed list size and scripted scroll; separately report higher refresh rates and large font scale. |
| Device-specific arm64 release download size | ≤ 25 MiB | Measure the device-specific download estimate from the signed release AAB/APK set using Play Console or `bundletool`; review any growth ≥ 2 MiB or ≥ 10% against the last recorded baseline. |
| First useful signed-in screen | Add a separately measured budget after authentication and representative Firestore data are wired | Record cold/warm auth, cache/server state and network condition; do not fold backend latency into Android first-frame time. |
| Configuration-gate or auth startup | No HR module query before the user chooses a signed-in feature route | Test via startup traces/logged query counters; never log the data values. |

Android's official [Macrobenchmark overview](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview) provides `StartupTimingMetric` for launch and `FrameTimingMetric` for frame behavior. Use a dedicated `com.android.test` Macrobenchmark module once the final application ID and real journey exist; the official setup requires a benchmark target and a non-debuggable target app. Emulator numbers are useful for regression debugging, but must not be presented as physical-device performance claims.

The initial app should reach its configuration/sign-in screen without querying organization, employee, attendance, leave, report, or document collections. The only current post-sign-in document listener is the signed-in user's own `users/{uid}` profile. Later module screens should delay expensive work until their route is visible and use bounded queries, cursor pagination, stable LazyColumn keys, and no per-row/N+1 reads. Load Storage content on explicit view/download only. Firestore's local persistence is useful for responsiveness but can return stale records; future data screens need a visible freshness/refresh state.

## Baselines, tracing, and regressions

Once a representative launch and one list scroll journey are instrumentable, add an Android Macrobenchmark test and collect a Baseline Profile for startup plus common navigation paths. Android's [Baseline Profile guidance](https://developer.android.com/topic/performance/baselineprofiles/overview) explains that profiles compile hot code paths earlier; the documented potential benefit is not a guarantee for this app. Compare identical release builds with and without the profile on the same physical device, and retain raw measurement output.

Use Android Studio System Trace/Perfetto when Macrobenchmark shows slow app initialization, main-thread blocking, extra recompositions, expensive Firestore conversion, or image work. Optimize the measured hotspot, rerun the same scenario, and report median and tail latency together with device/network/cache state. Keep startup classes lightweight; avoid loading extended icon packs, dependency-injection frameworks, background sync, remote fonts, or entire HR lists eagerly without a measured need.

The project does not yet contain a Macrobenchmark module, Baseline Profile generator, Firebase Emulator Suite, or UI screenshot instrumentation. A `:benchmark` module and its dependencies are deliberately deferred until the configuration gate can launch a final package and a real screen journey can be exercised; adding a benchmark that only measures placeholder navigation would create a number without product value. See [Android Macrobenchmark](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview) and [Baseline Profile measurement](https://developer.android.com/topic/performance/baselineprofiles/measure-baselineprofile) for the planned workflow.
