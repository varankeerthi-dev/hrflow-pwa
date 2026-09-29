package com.example.hrflow.data.hr

import kotlinx.coroutines.flow.Flow

data class OrganizationMembership(
    val orgId: String,
    val role: String?,
    val organizationName: String?,
)

data class ModulePermissions(
    val view: Boolean = false,
    val create: Boolean = false,
    val edit: Boolean = false,
    val delete: Boolean = false,
    val approve: Boolean = false,
    val export: Boolean = false,
    val full: Boolean = false,
)

data class HrUserProfile(
    val uid: String,
    val email: String?,
    val name: String?,
    val orgId: String?,
    val currentOrgId: String?,
    val role: String?,
    val employeeId: String?,
    val memberships: List<OrganizationMembership>,
    val permissions: Map<String, ModulePermissions>,
)

data class OrganizationSummary(
    val orgId: String,
    val name: String?,
    val logoUrl: String?,
)

/**
 * Read-only boundary for the existing Firestore data model. Implementations must
 * never treat client-side role/permission fields as a server authorization check.
 */
interface HrDataRepository {
    fun observeUserProfile(uid: String): Flow<HrUserProfile?>

    fun observeOrganization(orgId: String): Flow<OrganizationSummary?>
}
