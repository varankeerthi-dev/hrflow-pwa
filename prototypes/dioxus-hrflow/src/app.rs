use dioxus::prelude::*;
use dioxus_hrflow_prototype::attendance::{
    EmployeeId, Month, late_after_grace_minutes, snapshot_for,
};

const MAIN_CSS: Asset = asset!("/assets/main.css");
const INTER_FONT: Asset = asset!("/assets/fonts/inter_variable.ttf");

#[component]
pub fn App() -> Element {
    let mut selected_employee = use_signal(|| EmployeeId::Avery);
    let mut selected_month = use_signal(|| Month::September2026);

    let employee = *selected_employee.read();
    let month = *selected_month.read();
    let snapshot = snapshot_for(employee, month);
    let rate = snapshot
        .attendance_rate
        .map_or_else(|| "—".to_string(), |value| format!("{value}%"));
    let late_after_grace = late_after_grace_minutes(snapshot.rows)
        .map_or_else(|| "—".to_string(), |minutes| format!("{minutes:.0} min"));
    let font_face_rule = format!(
        "@font-face {{ font-family: 'Inter'; src: url('{INTER_FONT}') format('truetype'); font-style: normal; font-weight: 100 900; font-display: swap; }}"
    );
    let empty_message = format!(
        "There are no sample attendance entries for {} in {}.",
        employee.name(),
        month.label()
    );

    rsx! {
        document::Title { "Attendance overview · Synthetic demo" }
        document::Meta {
            name: "viewport",
            content: "width=device-width, initial-scale=1"
        }
        document::Link { rel: "stylesheet", href: MAIN_CSS }
        document::Link {
            rel: "preload",
            href: INTER_FONT,
            r#as: "font",
            type: "font/ttf",
            crossorigin: "anonymous"
        }
        style { "{font_face_rule}" }

        div { class: "app-shell",
            header { class: "topbar",
                div { class: "brand-lockup",
                    span { class: "brand-mark", aria_hidden: "true", "h" }
                    span { class: "brand-name", "hrflow" }
                    span { class: "brand-divider", aria_hidden: "true" }
                    span { class: "brand-context", "PEOPLE OPS PREVIEW" }
                }
                div { class: "topbar-status",
                    span { class: "status-dot", aria_hidden: "true" }
                    span { "Local prototype" }
                }
            }

            main { id: "main-content", class: "page-content",
                section { class: "page-intro", aria_labelledby: "page-title",
                    div { class: "intro-copy",
                        p { class: "eyebrow", "TEAM PULSE · ATTENDANCE" }
                        h1 { id: "page-title", "Attendance overview" }
                        p { class: "intro-description",
                            "A calm, read-only look at a fictional team's attendance."
                        }
                    }
                    p { class: "demo-badge",
                        span { class: "badge-dot", aria_hidden: "true" }
                        "Synthetic data · read-only"
                    }
                }

                section { class: "filter-panel", aria_labelledby: "filter-heading",
                    div { class: "filter-copy",
                        h2 { id: "filter-heading", "Choose a snapshot" }
                        p { "Your selection updates the summary and daily log." }
                    }
                    div { class: "filter-controls",
                        div { class: "field-group",
                            label { r#for: "employee-select", "Fictional employee" }
                            select {
                                id: "employee-select",
                                name: "employee",
                                value: employee.value(),
                                onchange: move |event| {
                                    if let Some(value) = EmployeeId::from_value(&event.value()) {
                                        selected_employee.set(value);
                                    }
                                },
                                for option in EmployeeId::ALL {
                                    option { key: "{option.value()}", value: option.value(),
                                        "{option.name()}"
                                    }
                                }
                            }
                        }
                        div { class: "field-group",
                            label { r#for: "month-select", "Month" }
                            select {
                                id: "month-select",
                                name: "month",
                                value: month.value(),
                                onchange: move |event| {
                                    if let Some(value) = Month::from_value(&event.value()) {
                                        selected_month.set(value);
                                    }
                                },
                                for option in Month::ALL {
                                    option { key: "{option.value()}", value: option.value(),
                                        "{option.label()}"
                                    }
                                }
                            }
                        }
                    }
                }

                section { class: "metrics", aria_labelledby: "summary-heading", aria_live: "polite",
                    h2 { id: "summary-heading", class: "sr-only", "Attendance summary" }
                    article { class: "metric-card metric-coral",
                        p { class: "metric-label", "Scheduled days" }
                        p { class: "metric-value", "{snapshot.scheduled_days}" }
                        p { class: "metric-note", "Sample workdays in this view" }
                    }
                    article { class: "metric-card metric-cream",
                        p { class: "metric-label", "Days present" }
                        p { class: "metric-value", "{snapshot.present_days}" }
                        p { class: "metric-note", "Includes late arrivals" }
                    }
                    article { class: "metric-card metric-lilac",
                        p { class: "metric-label", "Late starts" }
                        p { class: "metric-value", "{snapshot.late_days}" }
                        p { class: "metric-note", "Based on sample check-in times" }
                    }
                    article { class: "metric-card metric-white",
                        p { class: "metric-label", "Attendance rate" }
                        p { class: "metric-value", "{rate}" }
                        p { class: "metric-note", "Present days ÷ scheduled days" }
                    }
                    article { class: "metric-card metric-sage",
                        p { class: "metric-label", "Late after grace" }
                        p { class: "metric-value", "{late_after_grace}" }
                        p { class: "metric-note", "Sum beyond 15-minute arrival grace" }
                    }
                }

                section { class: "records-section", aria_labelledby: "records-heading",
                    div { class: "records-header",
                        div {
                            p { class: "eyebrow", "DAILY DETAIL" }
                            h2 { id: "records-heading", "Attendance log" }
                        }
                        p { class: "records-context", "{employee.name()} · {month.label()}" }
                    }

                    if snapshot.rows.is_empty() {
                        div { class: "empty-state", role: "status",
                            div { class: "empty-icon", aria_hidden: "true", "—" }
                            h3 { "No sample entries for this selection" }
                            p { "{empty_message} Try September 2026 or choose a different fictional employee." }
                        }
                    } else {
                        div {
                            class: "table-scroll",
                            tabindex: 0,
                            aria_label: "Attendance details table; scroll horizontally on narrow screens",
                            table {
                                caption { class: "sr-only", "Fictional daily attendance records for {employee.name()} in {month.label()}" }
                                thead {
                                    tr {
                                        th { scope: "col", "Date" }
                                        th { scope: "col", "Check-in" }
                                        th { scope: "col", "Check-out" }
                                        th { scope: "col", "Status" }
                                    }
                                }
                                tbody {
                                    for row in snapshot.rows {
                                        tr { key: "{row.date}",
                                            th { scope: "row", class: "date-cell", "{row.date}" }
                                            td { {row.check_in.unwrap_or("—")} }
                                            td { {row.check_out.unwrap_or("—")} }
                                            td {
                                                span {
                                                    class: "status-badge {row.status.class_name()}",
                                                    span { class: "badge-dot", aria_hidden: "true" }
                                                    "{row.status.label()}"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                footer { class: "page-footer",
                    p { "Invented records for interface review only. Not connected to production systems." }
                    p { class: "footer-version", "Dioxus 0.7.10 · Web prototype" }
                }
            }
        }
    }
}
