package com.example.hrflow.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.hrflow.data.hr.HrDataRepository
import com.example.hrflow.data.hr.HrUserProfile
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

sealed interface ProfileUiState {
    data object Loading : ProfileUiState
    data class Ready(val profile: HrUserProfile?) : ProfileUiState
    data object Error : ProfileUiState
}

class UserProfileViewModel(
    repository: HrDataRepository,
    uid: String,
) : ViewModel() {
    private val refreshRequests = MutableStateFlow(0)

    @OptIn(ExperimentalCoroutinesApi::class)
    val uiState = refreshRequests
        .flatMapLatest {
            repository.observeUserProfile(uid)
                .map<HrUserProfile?, ProfileUiState> { ProfileUiState.Ready(it) }
                .catch { emit(ProfileUiState.Error) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProfileUiState.Loading)

    fun retry() {
        refreshRequests.value += 1
    }
}

class UserProfileViewModelFactory(
    private val repository: HrDataRepository,
    private val uid: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(UserProfileViewModel::class.java))
        return UserProfileViewModel(repository, uid) as T
    }
}
