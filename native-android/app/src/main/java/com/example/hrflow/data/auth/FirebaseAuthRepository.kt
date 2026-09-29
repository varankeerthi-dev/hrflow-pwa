package com.example.hrflow.data.auth

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

class FirebaseAuthRepository(
    private val auth: FirebaseAuth,
) : AuthRepository {
    @OptIn(ExperimentalCoroutinesApi::class)
    override val authState: Flow<AuthSession?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            val user = firebaseAuth.currentUser
            trySend(
                user?.let {
                    AuthSession(
                        uid = it.uid,
                        email = it.email,
                        displayName = it.displayName,
                    )
                },
            )
        }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }

    override suspend fun signInWithEmail(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).awaitResult()
    }

    override suspend fun signOut() {
        auth.signOut()
    }
}
