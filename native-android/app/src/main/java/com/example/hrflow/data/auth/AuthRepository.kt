package com.example.hrflow.data.auth

import kotlinx.coroutines.flow.Flow

data class AuthSession(
    val uid: String,
    val email: String?,
    val displayName: String?,
)

interface AuthRepository {
    val authState: Flow<AuthSession?>

    suspend fun signInWithEmail(email: String, password: String)

    suspend fun signOut()
}
