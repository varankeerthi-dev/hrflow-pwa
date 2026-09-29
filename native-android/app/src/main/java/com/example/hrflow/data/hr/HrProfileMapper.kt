package com.example.hrflow.data.hr

internal fun mapHrUserProfile(uid: String, fields: Map<String, Any?>): HrUserProfile {
    val memberships = (fields["memberships"] as? List<*>)
        .orEmpty()
        .mapNotNull { item ->
            val values = item as? Map<*, *> ?: return@mapNotNull null
            val orgId = values["orgId"] as? String ?: return@mapNotNull null
            OrganizationMembership(
                orgId = orgId,
                role = values["role"] as? String,
                organizationName = values["orgName"] as? String,
            )
        }

    val rawPermissions = fields["permissions"] as? Map<*, *>
    val permissions = rawPermissions.orEmpty().mapNotNull { (module, value) ->
        val moduleName = module as? String ?: return@mapNotNull null
        val rights = value as? Map<*, *> ?: return@mapNotNull null
        moduleName to ModulePermissions(
            view = rights["view"] as? Boolean ?: false,
            create = rights["create"] as? Boolean ?: false,
            edit = rights["edit"] as? Boolean ?: false,
            delete = rights["delete"] as? Boolean ?: false,
            approve = rights["approve"] as? Boolean ?: false,
            export = rights["export"] as? Boolean ?: false,
            full = rights["full"] as? Boolean ?: false,
        )
    }.toMap()

    return HrUserProfile(
        uid = uid,
        email = fields["email"] as? String,
        name = fields["name"] as? String,
        orgId = fields["orgId"] as? String,
        currentOrgId = fields["currentOrgId"] as? String,
        role = fields["role"] as? String,
        employeeId = fields["employeeId"] as? String,
        memberships = memberships,
        permissions = permissions,
    )
}
