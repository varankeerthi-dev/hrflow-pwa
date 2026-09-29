package com.example.hrflow.ui.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.hrflow.data.auth.AuthSession
import com.example.hrflow.data.hr.HrDataRepository
import com.example.hrflow.ui.auth.AuthViewModel
import com.example.hrflow.ui.common.EmptyState
import com.example.hrflow.ui.common.ErrorState
import com.example.hrflow.ui.common.LoadingState

private enum class Destination(val title: String) {
    DASHBOARD("Overview"),
    PEOPLE("People"),
    ATTENDANCE("Attendance"),
    LEAVE("Leave"),
    COMMUNICATIONS("HR Communications"),
    MORE("More"),
}

private enum class BottomTab(val title: String) {
    HOME("Home"), PEOPLE("People"), TIME("Time"), MORE("More"),
}

@Composable
fun AuthenticatedShell(
    session: AuthSession,
    authViewModel: AuthViewModel,
    hrDataRepository: HrDataRepository,
) {
    var destination by remember(session.uid) { mutableStateOf(Destination.DASHBOARD) }
    val profileFactory = remember(session.uid, hrDataRepository) {
        UserProfileViewModelFactory(hrDataRepository, session.uid)
    }
    val profileViewModel: UserProfileViewModel = viewModel(
        key = "profile-${session.uid}",
        factory = profileFactory,
    )
    val profileState = profileViewModel.uiState.collectAsStateWithLifecycle().value

    Scaffold(
        bottomBar = {
            NavigationBar {
                val selectedTab = when (destination) {
                    Destination.DASHBOARD -> BottomTab.HOME
                    Destination.PEOPLE -> BottomTab.PEOPLE
                    Destination.ATTENDANCE, Destination.LEAVE -> BottomTab.TIME
                    Destination.COMMUNICATIONS, Destination.MORE -> BottomTab.MORE
                }
                BottomTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = {
                            destination = when (tab) {
                                BottomTab.HOME -> Destination.DASHBOARD
                                BottomTab.PEOPLE -> Destination.PEOPLE
                                BottomTab.TIME -> Destination.ATTENDANCE
                                BottomTab.MORE -> Destination.MORE
                            }
                        },
                        icon = { TabIcon(tab) },
                        label = { Text(tab.title) },
                    )
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
        ) {
            Text("HRFlow", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(12.dp))
            Text(
                destination.title,
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(16.dp))

            when (destination) {
                Destination.DASHBOARD -> OverviewContent(
                    email = session.email,
                    profileState = profileState,
                    onNavigate = { destination = it },
                    onRetryProfile = profileViewModel::retry,
                )
                Destination.PEOPLE -> EmptyState(
                    title = "People directory not migrated yet",
                    message = "The native foundation is ready for the directory; no employee records are loaded in this starter.",
                )
                Destination.ATTENDANCE -> EmptyState(
                    title = "Attendance is not migrated yet",
                    message = "Attendance screens and queries will be added after the access rules and data plan are reviewed.",
                    actionLabel = "View leave",
                    onAction = { destination = Destination.LEAVE },
                )
                Destination.LEAVE -> EmptyState(
                    title = "Leave is not migrated yet",
                    message = "Leave balances, requests, and approvals aren't connected in this foundation.",
                    actionLabel = "View attendance",
                    onAction = { destination = Destination.ATTENDANCE },
                )
                Destination.COMMUNICATIONS -> EmptyState(
                    title = "HR Communications is not migrated yet",
                    message = "Announcements, letters, policies, training, and delivery records are not read by this starter.",
                )
                Destination.MORE -> MoreContent(
                    onCommunications = { destination = Destination.COMMUNICATIONS },
                    onSignOut = authViewModel::signOut,
                )
            }
        }
    }
}

@Composable
private fun OverviewContent(
    email: String?,
    profileState: ProfileUiState,
    onNavigate: (Destination) -> Unit,
    onRetryProfile: () -> Unit,
) {
    Text(
        "Your workspace",
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.semantics { heading() },
    )
    Spacer(Modifier.height(6.dp))
    Text(
        email ?: "Signed in",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(18.dp))

    when (profileState) {
        ProfileUiState.Loading -> LoadingState("Loading your account profile", Modifier.height(140.dp))
        ProfileUiState.Error -> ErrorState(
            title = "Profile unavailable",
            message = "Your account profile couldn't be read. No other HR data was requested.",
            actionLabel = "Try again",
            onAction = onRetryProfile,
            modifier = Modifier.height(220.dp),
        )
        is ProfileUiState.Ready -> {
            val profile = profileState.profile
            if (profile == null) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    EmptyState(
                        title = "Account profile not found",
                        message = "HRFlow could not find a users/{uid} profile for this signed-in account.",
                    )
                }
            } else {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Text("Account context", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(12.dp))
                        ProfileRow("Name", profile.name ?: "—")
                        ProfileRow("Organization", profile.orgId ?: "Not linked")
                        ProfileRow("Role", profile.role ?: "Not assigned")
                    }
                }
            }
        }
    }

    Spacer(Modifier.height(20.dp))
    Text("Quick access", style = MaterialTheme.typography.titleMedium)
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { onNavigate(Destination.PEOPLE) }) { Text("People") }
        TextButton(onClick = { onNavigate(Destination.ATTENDANCE) }) { Text("Attendance") }
        TextButton(onClick = { onNavigate(Destination.LEAVE) }) { Text("Leave") }
    }
    Spacer(Modifier.height(12.dp))
    Text(
        "Foundation scope: sign-in and the signed-in user's own profile only. HR modules remain placeholders until their data access is reviewed.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ProfileRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun TabIcon(tab: BottomTab) {
    if (tab == BottomTab.TIME) {
        ClockTabIcon()
        return
    }
    Icon(
        imageVector = when (tab) {
            BottomTab.HOME -> Icons.Default.Home
            BottomTab.PEOPLE -> Icons.Default.Person
            BottomTab.MORE -> Icons.Default.Menu
            BottomTab.TIME -> error("Time uses the lightweight clock icon")
        },
        contentDescription = null,
    )
}

@Composable
private fun ClockTabIcon() {
    val tint = LocalContentColor.current
    Canvas(Modifier.size(24.dp)) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val radius = size.minDimension * 0.36f
        drawCircle(color = tint, radius = radius, center = center, style = Stroke(width = 2.dp.toPx()))
        drawLine(
            color = tint,
            start = center,
            end = Offset(center.x, center.y - radius * 0.52f),
            strokeWidth = 2.dp.toPx(),
            cap = StrokeCap.Round,
        )
        drawLine(
            color = tint,
            start = center,
            end = Offset(center.x + radius * 0.38f, center.y + radius * 0.16f),
            strokeWidth = 2.dp.toPx(),
            cap = StrokeCap.Round,
        )
    }
}

@Composable
private fun MoreContent(
    onCommunications: () -> Unit,
    onSignOut: () -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            TextButton(onClick = onCommunications) { Text("HR Communications") }
            TextButton(onClick = onSignOut) { Text("Sign out") }
        }
    }
    Spacer(Modifier.height(16.dp))
    Text(
        "Other HRFlow modules are shown in the separate design preview; they are not connected in this starter.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
