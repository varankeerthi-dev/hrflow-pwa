package com.example.hrflow.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.hrflow.R

/** Warm, high-contrast HRFlow palette for a friendly but work-focused mobile UI. */
object HrFlowColors {
    val BrandCoral = Color(0xFFC2413A)
    val BrandCoralDark = Color(0xFFA43732)
    val BrandCoralLight = Color(0xFFE76658)
    val BrandCoralTint = Color(0xFFFFEFEB)

    val White = Color(0xFFFFFFFF)
    val Warm50 = Color(0xFFFFF9F5)
    val Warm100 = Color(0xFFFFF2EB)
    val Warm200 = Color(0xFFF0DED5)
    val Warm500 = Color(0xFF826E66)
    val Warm700 = Color(0xFF59443D)
    val Warm800 = Color(0xFF362821)
    val Warm900 = Color(0xFF211814)

    val Success = Color(0xFF087F5B)
    val Warning = Color(0xFF9A5B08)
    val Danger = Color(0xFFB42318)
}

/** A 4 dp baseline; larger screens and accessibility scaling remain layout-driven. */
object HrFlowSpacing {
    val xxs = 4.dp
    val xs = 8.dp
    val sm = 12.dp
    val md = 16.dp
    val lg = 24.dp
    val xl = 32.dp
    val xxl = 48.dp
}

/** Rounded surfaces feel welcoming; elevation stays restrained and purposeful. */
object HrFlowElevation {
    val flat = 0.dp
    val card = 2.dp
    val raised = 4.dp
    val overlay = 12.dp
}

private val HrFlowLightScheme = lightColorScheme(
    primary = HrFlowColors.BrandCoral,
    onPrimary = HrFlowColors.White,
    primaryContainer = HrFlowColors.BrandCoralTint,
    onPrimaryContainer = HrFlowColors.BrandCoralDark,
    secondary = HrFlowColors.Warm700,
    onSecondary = HrFlowColors.White,
    background = HrFlowColors.Warm50,
    onBackground = HrFlowColors.Warm900,
    surface = HrFlowColors.White,
    onSurface = HrFlowColors.Warm900,
    surfaceVariant = HrFlowColors.Warm100,
    onSurfaceVariant = HrFlowColors.Warm700,
    outline = HrFlowColors.Warm200,
    outlineVariant = Color(0xFFF6E9E2),
    error = HrFlowColors.Danger,
    onError = HrFlowColors.White,
)

private val HrFlowDarkScheme = darkColorScheme(
    primary = Color(0xFFFF8D7E),
    onPrimary = Color(0xFF3F100C),
    primaryContainer = Color(0xFF702D27),
    onPrimaryContainer = Color(0xFFFFDAD4),
    secondary = Color(0xFFE0BEB0),
    onSecondary = Color(0xFF392620),
    background = Color(0xFF171211),
    onBackground = Color(0xFFF3E6E1),
    surface = Color(0xFF171211),
    onSurface = Color(0xFFF3E6E1),
    surfaceVariant = Color(0xFF2B211E),
    onSurfaceVariant = Color(0xFFE0C6BC),
    outline = Color(0xFF8F746A),
    outlineVariant = Color(0xFF44332D),
    error = Color(0xFFFFB4A9),
    onError = Color(0xFF690005),
)

/** Locally bundled Inter variable font; weights are resolved from its wght axis. */
private val InterFont = FontFamily(
    Font(R.font.inter_variable, weight = FontWeight.Normal),
    Font(R.font.inter_variable, weight = FontWeight.Medium),
    Font(R.font.inter_variable, weight = FontWeight.SemiBold),
    Font(R.font.inter_variable, weight = FontWeight.Bold),
)

private val HrFlowTypography = Typography(
    displaySmall = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.Bold, fontSize = 36.sp, lineHeight = 44.sp),
    headlineMedium = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 36.sp),
    headlineSmall = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 32.sp),
    titleLarge = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 24.sp),
    titleSmall = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.Bold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = InterFont, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 16.sp),
)

private val HrFlowShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun HrFlowTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) HrFlowDarkScheme else HrFlowLightScheme,
        typography = HrFlowTypography,
        shapes = HrFlowShapes,
        content = content,
    )
}
