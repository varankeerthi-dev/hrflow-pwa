package com.example.hrflow.data.auth

import com.google.android.gms.tasks.Task
import kotlinx.coroutines.suspendCancellableCoroutine

internal suspend fun <T> Task<T>.awaitResult(): T = suspendCancellableCoroutine { continuation ->
    addOnCompleteListener { completed ->
        if (!continuation.isActive) return@addOnCompleteListener

        if (completed.isSuccessful) {
            continuation.resumeWith(Result.success(completed.result))
        } else {
            continuation.resumeWith(
                Result.failure(
                    completed.exception ?: IllegalStateException("Firebase operation failed."),
                ),
            )
        }
    }
}
