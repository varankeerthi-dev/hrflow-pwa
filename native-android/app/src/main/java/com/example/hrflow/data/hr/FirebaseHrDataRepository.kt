package com.example.hrflow.data.hr

import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

class FirebaseHrDataRepository(
    private val firestore: FirebaseFirestore,
) : HrDataRepository {
    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observeUserProfile(uid: String): Flow<HrUserProfile?> = callbackFlow {
        val registration = firestore.collection("users")
            .document(uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                } else if (snapshot == null || !snapshot.exists()) {
                    trySend(null)
                } else {
                    trySend(mapHrUserProfile(uid, snapshot.data.orEmpty()))
                }
            }
        awaitClose { registration.remove() }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observeOrganization(orgId: String): Flow<OrganizationSummary?> = callbackFlow {
        val registration = firestore.collection("organisations")
            .document(orgId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                } else if (snapshot == null || !snapshot.exists()) {
                    trySend(null)
                } else {
                    trySend(
                        OrganizationSummary(
                            orgId = snapshot.id,
                            name = snapshot.getString("name"),
                            logoUrl = snapshot.getString("logoURL"),
                        ),
                    )
                }
            }
        awaitClose { registration.remove() }
    }
}
