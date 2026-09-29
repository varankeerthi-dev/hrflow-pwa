package com.example.hrflow.data.hr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HrProfileMapperTest {
    @Test
    fun mapsLegacyAndMembershipFieldsWithoutInventingPermissions() {
        val profile = mapHrUserProfile(
            uid = "uid-1",
            fields = mapOf(
                "email" to "person@example.test",
                "name" to "Preview User",
                "orgId" to "org-1",
                "currentOrgId" to "org-1",
                "role" to "employee",
                "employeeId" to "employee-1",
                "memberships" to listOf(
                    mapOf("orgId" to "org-1", "role" to "employee", "orgName" to "Preview Org"),
                ),
                "permissions" to mapOf(
                    "Attendance" to mapOf("view" to true, "export" to false),
                ),
            ),
        )

        assertEquals("uid-1", profile.uid)
        assertEquals("org-1", profile.currentOrgId)
        assertEquals("Preview Org", profile.memberships.single().organizationName)
        assertTrue(profile.permissions.getValue("Attendance").view)
        assertFalse(profile.permissions.getValue("Attendance").export)
        assertFalse(profile.permissions.getValue("Attendance").edit)
    }

    @Test
    fun ignoresMalformedMembershipsAndPermissions() {
        val profile = mapHrUserProfile(
            uid = "uid-2",
            fields = mapOf(
                "memberships" to listOf("not-a-map", mapOf("role" to "employee")),
                "permissions" to mapOf("Attendance" to "not-a-map"),
            ),
        )

        assertTrue(profile.memberships.isEmpty())
        assertTrue(profile.permissions.isEmpty())
        assertEquals(null, profile.orgId)
    }
}
