package com.example.hrflow.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.hrflow.data.auth.AuthRepository
import com.example.hrflow.data.auth.AuthSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

sealed interface AuthUiState {
    data object Checking : AuthUiState
    data object SignedOut : AuthUiState
    data class SignedIn(val session: AuthSession) : AuthUiState
    data class Error(val message: String) : AuthUiState
}

class AuthViewModel(
    private val repository: AuthRepository,
) : ViewModel() {
    private val mutableUiState = MutableStateFlow<AuthUiState>(AuthUiState.Checking)
    val uiState: StateFlow<AuthUiState> = mutableUiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.authState
                .catch {
                    mutableUiState.value = AuthUiState.Error(
                        "We couldn't check your sign-in session. Check your connection and try again.",
                    )
                }
                .collect { session ->
                    mutableUiState.value = session?.let(AuthUiState::SignedIn) ?: AuthUiState.SignedOut
                }
        }
    }

    fun signIn(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            mutableUiState.value = AuthUiState.Error("Enter both your email and password.")
            return
        }

        mutableUiState.value = AuthUiState.Checking
        viewModelScope.launch {
            try {
                repository.signInWithEmail(email, password)
            } catch (_: Exception) {
                // Avoid showing raw Firebase exceptions or confirming whether an account exists.
                mutableUiState.value = AuthUiState.Error(
                    "Sign-in wasn't successful. Check your details and connection, then try again.",
                )
            }
        }
    }

    fun retrySignIn() {
        mutableUiState.value = AuthUiState.SignedOut
    }

    fun signOut() {
        viewModelScope.launch {
            try {
                repository.signOut()
            } catch (_: Exception) {
                mutableUiState.value = AuthUiState.Error("Sign-out failed. Please try again.")
            }
        }
    }
}

class AuthViewModelFactory(
    private val repository: AuthRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(AuthViewModel::class.java))
        return AuthViewModel(repository) as T
    }
}
