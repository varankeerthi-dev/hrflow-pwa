package com.example.hrflow.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.hrflow.data.auth.FirebaseAuthRepository
import com.example.hrflow.data.hr.FirebaseHrDataRepository
import com.example.hrflow.ui.auth.AuthUiState
import com.example.hrflow.ui.auth.AuthViewModel
import com.example.hrflow.ui.auth.AuthViewModelFactory
import com.example.hrflow.ui.auth.SignInScreen
import com.example.hrflow.ui.common.ErrorState
import com.example.hrflow.ui.common.FirebaseSetupScreen
import com.example.hrflow.ui.common.LoadingState
import com.example.hrflow.ui.home.AuthenticatedShell
import com.example.hrflow.ui.theme.HrFlowTheme
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

@Composable
fun HrFlowApp() {
    val context = LocalContext.current
    val firebaseConfigured = remember(context) {
        FirebaseApp.getApps(context).any { it.name == FirebaseApp.DEFAULT_APP_NAME }
    }

    HrFlowTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = androidx.compose.material3.MaterialTheme.colorScheme.background,
        ) {
            if (!firebaseConfigured) {
                FirebaseSetupScreen()
            } else {
                val authRepository = remember { FirebaseAuthRepository(FirebaseAuth.getInstance()) }
                val hrDataRepository = remember { FirebaseHrDataRepository(FirebaseFirestore.getInstance()) }
                val factory = remember(authRepository) { AuthViewModelFactory(authRepository) }
                val authViewModel: AuthViewModel = viewModel(factory = factory)
                val state = authViewModel.uiState.collectAsStateWithLifecycle().value

                when (state) {
                    AuthUiState.Checking -> LoadingState("Checking your sign-in session")
                    AuthUiState.SignedOut -> SignInScreen(authViewModel::signIn)
                    is AuthUiState.Error -> ErrorState(
                        title = "We couldn't continue",
                        message = state.message,
                        actionLabel = "Return to sign in",
                        onAction = authViewModel::retrySignIn,
                    )
                    is AuthUiState.SignedIn -> AuthenticatedShell(
                        session = state.session,
                        authViewModel = authViewModel,
                        hrDataRepository = hrDataRepository,
                    )
                }
            }
        }
    }
}
