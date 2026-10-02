use hrflow_attendance_policy::domain::calculate_chargeable_late_minutes;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EmployeeId {
    Avery,
    Jordan,
    Riley,
}

impl EmployeeId {
    pub const ALL: [Self; 3] = [Self::Avery, Self::Jordan, Self::Riley];

    pub const fn value(self) -> &'static str {
        match self {
            Self::Avery => "avery",
            Self::Jordan => "jordan",
            Self::Riley => "riley",
        }
    }

    pub fn from_value(value: &str) -> Option<Self> {
        match value {
            "avery" => Some(Self::Avery),
            "jordan" => Some(Self::Jordan),
            "riley" => Some(Self::Riley),
            _ => None,
        }
    }

    pub const fn name(self) -> &'static str {
        match self {
            Self::Avery => "Avery Stone",
            Self::Jordan => "Jordan Vale",
            Self::Riley => "Riley Park",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Month {
    September2026,
    August2026,
}

impl Month {
    pub const ALL: [Self; 2] = [Self::September2026, Self::August2026];

    pub const fn value(self) -> &'static str {
        match self {
            Self::September2026 => "2026-09",
            Self::August2026 => "2026-08",
        }
    }

    pub fn from_value(value: &str) -> Option<Self> {
        match value {
            "2026-09" => Some(Self::September2026),
            "2026-08" => Some(Self::August2026),
            _ => None,
        }
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::September2026 => "September 2026",
            Self::August2026 => "August 2026",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DayStatus {
    OnTime,
    Late,
    Absent,
}

impl DayStatus {
    pub const fn label(self) -> &'static str {
        match self {
            Self::OnTime => "On time",
            Self::Late => "Late",
            Self::Absent => "Absent",
        }
    }

    pub const fn class_name(self) -> &'static str {
        match self {
            Self::OnTime => "on-time",
            Self::Late => "late",
            Self::Absent => "absent",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AttendanceDay {
    pub date: &'static str,
    pub status: DayStatus,
    pub check_in: Option<&'static str>,
    pub check_out: Option<&'static str>,
    /// Invented raw lateness input, in minutes; it does not change the row status.
    pub raw_late_minutes: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AttendanceSnapshot {
    pub rows: &'static [AttendanceDay],
    pub scheduled_days: usize,
    /// Includes both on-time and late arrivals.
    pub present_days: usize,
    pub late_days: usize,
    /// `None` means this selection has no sample records to summarize.
    pub attendance_rate: Option<u8>,
}

struct EmployeeDataset {
    employee: EmployeeId,
    month: Month,
    rows: &'static [AttendanceDay],
}

const fn day(
    date: &'static str,
    status: DayStatus,
    check_in: Option<&'static str>,
    check_out: Option<&'static str>,
    raw_late_minutes: f64,
) -> AttendanceDay {
    AttendanceDay {
        date,
        status,
        check_in,
        check_out,
        raw_late_minutes,
    }
}

const ARRIVAL_GRACE_MINUTES: f64 = 15.0;

/// Sum the shared attendance rule over the selected synthetic rows.
/// An empty slice is unknown/not applicable rather than a zero-minute sample.
pub fn late_after_grace_minutes(rows: &[AttendanceDay]) -> Option<f64> {
    if rows.is_empty() {
        return None;
    }

    Some(
        rows.iter()
            .map(|row| {
                calculate_chargeable_late_minutes(row.raw_late_minutes, ARRIVAL_GRACE_MINUTES)
            })
            .sum(),
    )
}

// Raw lateness values below are synthetic fixture inputs, not attendance policy.
const AVERY_SEPTEMBER: &[AttendanceDay] = &[
    day(
        "Sep 01",
        DayStatus::OnTime,
        Some("08:54"),
        Some("17:22"),
        0.0,
    ),
    day(
        "Sep 02",
        DayStatus::OnTime,
        Some("08:58"),
        Some("17:31"),
        0.0,
    ),
    day(
        "Sep 03",
        DayStatus::Late,
        Some("09:16"),
        Some("17:45"),
        16.0,
    ),
    day(
        "Sep 04",
        DayStatus::OnTime,
        Some("08:51"),
        Some("17:19"),
        0.0,
    ),
    day(
        "Sep 07",
        DayStatus::OnTime,
        Some("08:57"),
        Some("17:28"),
        0.0,
    ),
    day("Sep 08", DayStatus::Absent, None, None, 0.0),
    day(
        "Sep 09",
        DayStatus::OnTime,
        Some("08:55"),
        Some("17:25"),
        0.0,
    ),
    day(
        "Sep 10",
        DayStatus::Late,
        Some("09:11"),
        Some("17:38"),
        11.0,
    ),
    day(
        "Sep 11",
        DayStatus::OnTime,
        Some("08:52"),
        Some("17:20"),
        0.0,
    ),
    day(
        "Sep 14",
        DayStatus::OnTime,
        Some("08:56"),
        Some("17:26"),
        0.0,
    ),
];

const JORDAN_SEPTEMBER: &[AttendanceDay] = &[
    day(
        "Sep 01",
        DayStatus::OnTime,
        Some("08:48"),
        Some("17:16"),
        0.0,
    ),
    day(
        "Sep 02",
        DayStatus::OnTime,
        Some("08:53"),
        Some("17:24"),
        0.0,
    ),
    day(
        "Sep 03",
        DayStatus::OnTime,
        Some("08:57"),
        Some("17:29"),
        0.0,
    ),
    day(
        "Sep 04",
        DayStatus::Late,
        Some("09:13"),
        Some("17:42"),
        13.0,
    ),
    day(
        "Sep 07",
        DayStatus::OnTime,
        Some("08:55"),
        Some("17:25"),
        0.0,
    ),
    day(
        "Sep 08",
        DayStatus::OnTime,
        Some("08:51"),
        Some("17:19"),
        0.0,
    ),
    day("Sep 09", DayStatus::Absent, None, None, 0.0),
    day(
        "Sep 10",
        DayStatus::OnTime,
        Some("08:59"),
        Some("17:34"),
        0.0,
    ),
    day(
        "Sep 11",
        DayStatus::OnTime,
        Some("08:52"),
        Some("17:21"),
        0.0,
    ),
    day(
        "Sep 14",
        DayStatus::OnTime,
        Some("08:56"),
        Some("17:27"),
        0.0,
    ),
];

const RILEY_SEPTEMBER: &[AttendanceDay] = &[
    day(
        "Sep 01",
        DayStatus::OnTime,
        Some("08:56"),
        Some("17:23"),
        0.0,
    ),
    day(
        "Sep 02",
        DayStatus::Late,
        Some("09:21"),
        Some("17:47"),
        21.0,
    ),
    day("Sep 03", DayStatus::Absent, None, None, 0.0),
    day(
        "Sep 04",
        DayStatus::OnTime,
        Some("08:54"),
        Some("17:22"),
        0.0,
    ),
    day("Sep 07", DayStatus::Absent, None, None, 0.0),
    day(
        "Sep 08",
        DayStatus::OnTime,
        Some("08:58"),
        Some("17:28"),
        0.0,
    ),
    day(
        "Sep 09",
        DayStatus::OnTime,
        Some("08:52"),
        Some("17:19"),
        0.0,
    ),
    day("Sep 10", DayStatus::Absent, None, None, 0.0),
    day(
        "Sep 11",
        DayStatus::OnTime,
        Some("08:55"),
        Some("17:26"),
        0.0,
    ),
    day(
        "Sep 14",
        DayStatus::OnTime,
        Some("08:57"),
        Some("17:25"),
        0.0,
    ),
];

const JORDAN_AUGUST: &[AttendanceDay] = &[
    day(
        "Aug 03",
        DayStatus::OnTime,
        Some("08:52"),
        Some("17:20"),
        0.0,
    ),
    day(
        "Aug 04",
        DayStatus::OnTime,
        Some("08:56"),
        Some("17:25"),
        0.0,
    ),
    day(
        "Aug 05",
        DayStatus::Late,
        Some("09:12"),
        Some("17:40"),
        12.0,
    ),
    day(
        "Aug 06",
        DayStatus::OnTime,
        Some("08:54"),
        Some("17:22"),
        0.0,
    ),
    day(
        "Aug 07",
        DayStatus::OnTime,
        Some("08:50"),
        Some("17:17"),
        0.0,
    ),
    day(
        "Aug 10",
        DayStatus::OnTime,
        Some("08:57"),
        Some("17:28"),
        0.0,
    ),
    day(
        "Aug 11",
        DayStatus::OnTime,
        Some("08:53"),
        Some("17:21"),
        0.0,
    ),
    day(
        "Aug 12",
        DayStatus::OnTime,
        Some("08:55"),
        Some("17:24"),
        0.0,
    ),
    day("Aug 13", DayStatus::Late, Some("09:08"), Some("17:36"), 8.0),
    day(
        "Aug 14",
        DayStatus::OnTime,
        Some("08:58"),
        Some("17:29"),
        0.0,
    ),
];

const DATASETS: &[EmployeeDataset] = &[
    EmployeeDataset {
        employee: EmployeeId::Avery,
        month: Month::September2026,
        rows: AVERY_SEPTEMBER,
    },
    EmployeeDataset {
        employee: EmployeeId::Jordan,
        month: Month::September2026,
        rows: JORDAN_SEPTEMBER,
    },
    EmployeeDataset {
        employee: EmployeeId::Riley,
        month: Month::September2026,
        rows: RILEY_SEPTEMBER,
    },
    EmployeeDataset {
        employee: EmployeeId::Jordan,
        month: Month::August2026,
        rows: JORDAN_AUGUST,
    },
];

/// Derive a read-only summary from one employee/month selection.
/// Unmatched (but valid) selections produce an empty snapshot rather than fake data.
pub fn snapshot_for(employee: EmployeeId, month: Month) -> AttendanceSnapshot {
    let rows = DATASETS
        .iter()
        .find(|dataset| dataset.employee == employee && dataset.month == month)
        .map_or(&[][..], |dataset| dataset.rows);
    let scheduled_days = rows.len();
    let present_days = rows
        .iter()
        .filter(|row| matches!(row.status, DayStatus::OnTime | DayStatus::Late))
        .count();
    let late_days = rows
        .iter()
        .filter(|row| row.status == DayStatus::Late)
        .count();
    let attendance_rate = (scheduled_days > 0)
        .then(|| ((present_days * 100 + scheduled_days / 2) / scheduled_days) as u8);

    AttendanceSnapshot {
        rows,
        scheduled_days,
        present_days,
        late_days,
        attendance_rate,
    }
}

#[cfg(test)]
mod tests {
    use super::{DayStatus, EmployeeId, Month, snapshot_for};

    #[test]
    fn summary_is_derived_consistently_from_the_selected_rows() {
        let snapshot = snapshot_for(EmployeeId::Avery, Month::September2026);

        assert_eq!(snapshot.scheduled_days, 10);
        assert_eq!(snapshot.present_days, 9);
        assert_eq!(snapshot.late_days, 2);
        assert_eq!(snapshot.attendance_rate, Some(90));
        assert_eq!(
            snapshot
                .rows
                .iter()
                .filter(|row| row.status == DayStatus::Absent)
                .count(),
            1
        );
    }

    #[test]
    fn valid_selection_without_fixture_rows_has_an_explicit_empty_summary() {
        let snapshot = snapshot_for(EmployeeId::Avery, Month::August2026);

        assert!(snapshot.rows.is_empty());
        assert_eq!(snapshot.scheduled_days, 0);
        assert_eq!(snapshot.present_days, 0);
        assert_eq!(snapshot.late_days, 0);
        assert_eq!(snapshot.attendance_rate, None);
    }

    #[test]
    fn changing_employee_and_month_selects_a_different_synthetic_snapshot() {
        let september = snapshot_for(EmployeeId::Jordan, Month::September2026);
        let august = snapshot_for(EmployeeId::Jordan, Month::August2026);
        let other_employee = snapshot_for(EmployeeId::Riley, Month::September2026);

        assert_eq!(september.scheduled_days, 10);
        assert_eq!(august.scheduled_days, 10);
        assert_ne!(september.rows[0].date, august.rows[0].date);
        assert_eq!(other_employee.present_days, 7);
        assert_eq!(other_employee.attendance_rate, Some(70));
    }

    #[test]
    fn late_after_grace_aggregate_uses_shared_policy_for_selected_rows() {
        let synthetic_rows = [
            super::day(
                "Test 01",
                DayStatus::Late,
                Some("09:20"),
                Some("17:00"),
                20.0,
            ),
            super::day(
                "Test 02",
                DayStatus::Late,
                Some("09:15"),
                Some("17:00"),
                15.0,
            ),
            super::day(
                "Test 03",
                DayStatus::OnTime,
                Some("09:00"),
                Some("17:00"),
                0.0,
            ),
        ];
        assert_eq!(super::late_after_grace_minutes(&synthetic_rows), Some(5.0));

        let avery = snapshot_for(EmployeeId::Avery, Month::September2026);
        let jordan = snapshot_for(EmployeeId::Jordan, Month::September2026);
        assert_eq!(super::late_after_grace_minutes(avery.rows), Some(1.0));
        assert_eq!(super::late_after_grace_minutes(jordan.rows), Some(0.0));
    }

    #[test]
    fn selector_values_are_validated_into_closed_domain_types() {
        assert_eq!(EmployeeId::from_value("avery"), Some(EmployeeId::Avery));
        assert_eq!(EmployeeId::from_value("unknown"), None);
        assert_eq!(Month::from_value("2026-09"), Some(Month::September2026));
        assert_eq!(Month::from_value("2026-07"), None);
    }
}
