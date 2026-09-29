#!/usr/bin/env python3
"""Render static HRFlow Android screen concepts without business or employee data."""
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
W, H = 390, 844
FONT_PATH = OUT.parent / "app/src/main/res/font/inter_variable.ttf"
C = {
    "coral": "#C2413A", "coral_dark": "#A43732", "coral_light": "#E76658",
    "coral_tint": "#FFEFEB", "white": "#FFFFFF", "canvas": "#FFF9F5",
    "warm50": "#FFF9F5", "warm100": "#FFF2EB", "warm200": "#F0DED5",
    "warm400": "#B9A39A", "warm500": "#826E66", "warm700": "#59443D",
    "ink": "#30241F", "ink_deep": "#211814", "green": "#087F5B",
    "amber": "#9A5B08", "danger": "#B42318", "frame": "#E7D7CE",
}


@lru_cache(maxsize=128)
def font(size, weight="Regular"):
    f = ImageFont.truetype(str(FONT_PATH), size)
    # Inter's axes are ordered Optical size, then Weight.
    weights = {"Regular": 400, "Medium": 500, "SemiBold": 600, "Bold": 700}
    f.set_variation_by_axes([max(14, min(32, size)), weights[weight]])
    return f


def text(draw, xy, value, size=14, color=None, bold=False, anchor=None):
    draw.text(
        xy, value, fill=color or C["ink"],
        font=font(size, "Bold" if bold else "Regular"), anchor=anchor,
    )


def wrap(draw, value, x, y, max_width, size=12, color=None, bold=False, line_gap=5, max_lines=None):
    f = font(size, "Bold" if bold else "Regular")
    words, lines, line = value.split(), [], ""
    for word in words:
        candidate = word if not line else f"{line} {word}"
        if draw.textbbox((0, 0), candidate, font=f)[2] <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    if max_lines is not None:
        lines = lines[:max_lines]
    line_height = size + line_gap
    for index, item in enumerate(lines):
        draw.text((x, y + index * line_height), item, fill=color or C["warm700"], font=f)
    return y + len(lines) * line_height


def rounded(draw, box, radius=14, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def divider(draw, y, x1=20, x2=W - 20):
    draw.line((x1, y, x2, y), fill=C["warm200"], width=1)


def app_chrome(img, current="Home", detail=False):
    d = ImageDraw.Draw(img)
    # Neutral Android system chrome; no identity or HR data is shown.
    text(d, (22, 12), "9:41", 11, C["warm700"], True)
    for i, h in enumerate((4, 6, 8)):
        x = W - 82 + i * 5
        d.rounded_rectangle((x, 25 - h, x + 3, 25), radius=2, fill=C["warm500"])
    d.arc((W - 52, 10, W - 34, 26), 205, 335, fill=C["warm500"], width=2)
    d.rounded_rectangle((W - 27, 15, W - 12, 24), radius=2, outline=C["warm500"], width=1)
    d.rectangle((W - 25, 17, W - 17, 22), fill=C["warm500"])

    # HRFlow's own monogram and shell, not adapted from another app's identity.
    rounded(d, (20, 42, 54, 76), 11, C["coral"])
    text(d, (37, 59), "H", 18, C["white"], True, anchor="mm")
    text(d, (64, 50), "HRFlow", 17, C["ink_deep"], True)
    if detail:
        text(d, (W - 32, 58), "‹", 29, C["warm700"], False, anchor="mm")
    else:
        rounded(d, (W - 58, 45, W - 20, 83), 19, C["coral_tint"])
        text(d, (W - 39, 64), "—", 16, C["coral_dark"], True, anchor="mm")
    divider(d, 94, 0, W)
    return d


def bottom_nav(draw, selected):
    y = 760
    draw.rectangle((0, y, W, H), fill=C["white"])
    divider(draw, y, 0, W)
    items = [("Home", "H"), ("People", "P"), ("Time", "T"), ("More", "•••")]
    slot = W / 4
    for idx, (label, glyph) in enumerate(items):
        cx = int(slot * idx + slot / 2)
        is_selected = label == selected
        if is_selected:
            rounded(draw, (cx - 27, y + 8, cx + 27, y + 39), 16, C["coral_tint"])
        text(draw, (cx, y + 23), glyph, 12, C["coral_dark"] if is_selected else C["warm500"], True, anchor="mm")
        text(draw, (cx, y + 55), label, 10, C["coral_dark"] if is_selected else C["warm500"], is_selected, anchor="mm")


def draw_search_icon(draw, x, y):
    draw.ellipse((x, y, x + 11, y + 11), outline=C["warm500"], width=2)
    draw.line((x + 9, y + 9, x + 15, y + 15), fill=C["warm500"], width=2)


def draw_calendar_icon(draw, x, y):
    rounded(draw, (x, y, x + 18, y + 18), 4, C["white"], C["warm500"], 1)
    draw.line((x + 1, y + 6, x + 17, y + 6), fill=C["warm500"], width=1)
    draw.line((x + 5, y - 2, x + 5, y + 3), fill=C["warm500"], width=2)
    draw.line((x + 13, y - 2, x + 13, y + 3), fill=C["warm500"], width=2)


def preview_badge(draw, y=108):
    rounded(draw, (20, y, 198, y + 26), 13, C["coral_tint"])
    text(draw, (31, y + 7), "STATIC CONCEPT  ·  NOT LIVE", 10, C["coral_dark"], True)
    return y + 39


def heading(draw, title, subtitle=None, y=150):
    text(draw, (20, y), title, 25, C["ink_deep"], True)
    if subtitle:
        wrap(draw, subtitle, 20, y + 35, W - 40, 13, C["warm500"], line_gap=4, max_lines=2)
    return y + (63 if subtitle else 45)


def card(draw, box, radius=16, fill=C["white"], outline=C["warm200"]):
    rounded(draw, box, radius, fill, outline, 1)


def metric(draw, box, label, value="—"):
    # Metrics stay blank; labels preserve hierarchy without edge bars or invented figures.
    card(draw, box, radius=15, fill=C["white"])
    x1, y1, _, _ = box
    text(draw, (x1 + 12, y1 + 14), label, 10, C["warm500"], True)
    text(draw, (x1 + 12, y1 + 38), value, 22, C["ink_deep"], True)


def empty_card(draw, box, title, body):
    card(draw, box, radius=18, fill=C["white"])
    x1, y1, x2, _ = box
    cx = (x1 + x2) // 2
    rounded(draw, (cx - 22, y1 + 20, cx + 22, y1 + 64), 22, C["coral_tint"])
    text(draw, (cx, y1 + 42), "—", 18, C["coral_dark"], True, anchor="mm")
    text(draw, (cx, y1 + 83), title, 14, C["ink"], True, anchor="mm")
    wrap(draw, body, x1 + 18, y1 + 108, x2 - x1 - 36, 11, C["warm500"], line_gap=4, max_lines=4)


def draw_overview():
    img = Image.new("RGB", (W, H), C["warm50"])
    d = app_chrome(img, "Home")
    y = preview_badge(d)
    y = heading(d, "Overview", "Your HRFlow workspace", y)
    card(d, (20, y, W - 20, y + 78), radius=18, fill=C["warm100"], outline=C["warm100"])
    text(d, (36, y + 16), "Workspace context", 13, C["coral_dark"], True)
    wrap(d, "Account and organization details appear after secure setup.", 36, y + 41, W - 72, 12, C["warm700"], max_lines=2)
    y += 95
    text(d, (20, y), "At a glance", 15, C["ink_deep"], True)
    y += 14
    gap = 8
    cardw = (W - 40 - gap * 2) // 3
    metric(d, (20, y + 12, 20 + cardw, y + 91), "PRESENT")
    metric(d, (20 + cardw + gap, y + 12, 20 + 2 * cardw + gap, y + 91), "ON LEAVE")
    metric(d, (20 + 2 * (cardw + gap), y + 12, W - 20, y + 91), "OPEN ITEMS")
    y += 111
    text(d, (20, y), "Quick access", 15, C["ink_deep"], True)
    y += 25
    for idx, (label, hint) in enumerate((("People", "Directory"), ("Attendance", "Daily summary"), ("Leave", "Requests and balances"))):
        yy = y + idx * 54
        card(d, (20, yy, W - 20, yy + 46), radius=14)
        rounded(d, (31, yy + 8, 61, yy + 38), 11, C["coral_tint"])
        text(d, (46, yy + 23), str(idx + 1), 12, C["coral_dark"], True, anchor="mm")
        text(d, (73, yy + 7), label, 13, C["ink"], True)
        text(d, (73, yy + 26), hint, 11, C["warm500"])
        text(d, (W - 38, yy + 23), "›", 20, C["warm500"], False, anchor="mm")
    y += 174
    text(d, (20, y), "Recent activity", 15, C["ink_deep"], True)
    text(d, (20, y + 26), "No activity records in this static preview.", 11, C["warm500"])
    bottom_nav(d, "Home")
    return img


def draw_employees():
    img = Image.new("RGB", (W, H), C["warm50"])
    d = app_chrome(img, "People")
    y = preview_badge(d)
    y = heading(d, "People", "Employee directory", y)
    rounded(d, (20, y, W - 20, y + 48), 14, C["white"], C["warm200"])
    draw_search_icon(d, 36, y + 16)
    text(d, (64, y + 17), "Search by name or role", 12, C["warm500"])
    y += 62
    rounded(d, (20, y, 116, y + 36), 18, C["coral_tint"])
    text(d, (68, y + 18), "Active", 11, C["coral_dark"], True, anchor="mm")
    rounded(d, (123, y, 199, y + 36), 18, C["white"], C["warm200"])
    text(d, (161, y + 18), "All", 11, C["warm700"], True, anchor="mm")
    text(d, (W - 20, y + 18), "Filters", 11, C["warm700"], True, anchor="rm")
    y += 52
    text(d, (20, y), "Directory", 15, C["ink_deep"], True)
    text(d, (W - 20, y + 2), "— people", 11, C["warm500"], anchor="rm")
    y += 29
    empty_card(d, (20, y, W - 20, 568), "No employee records shown", "Directory content appears only after sign-in, access review, and migration.")
    bottom_nav(d, "People")
    return img


def draw_attendance():
    img = Image.new("RGB", (W, H), C["warm50"])
    d = app_chrome(img, "Time")
    y = preview_badge(d)
    y = heading(d, "Attendance", "Daily summary and records", y)
    card(d, (20, y, W - 20, y + 49), radius=14)
    text(d, (36, y + 16), "Today", 13, C["ink"], True)
    draw_calendar_icon(d, W - 52, y + 16)
    y += 62
    text(d, (20, y), "Summary", 15, C["ink_deep"], True)
    y += 14
    gap = 8
    mw = (W - 40 - gap * 2) // 3
    metric(d, (20, y + 12, 20 + mw, y + 91), "PRESENT")
    metric(d, (20 + mw + gap, y + 12, 20 + 2 * mw + gap, y + 91), "ABSENT")
    metric(d, (20 + 2 * (mw + gap), y + 12, W - 20, y + 91), "HALF-DAY")
    y += 112
    text(d, (20, y), "Attendance log", 15, C["ink_deep"], True)
    y += 15
    rounded(d, (20, y + 8, W - 20, y + 46), 19, C["warm100"], C["warm200"])
    text(d, (36, y + 20), "All sites", 11, C["warm700"], True)
    text(d, (W - 38, y + 26), "⌄", 16, C["warm700"], anchor="mm")
    empty_card(d, (20, y + 58, W - 20, 620), "No attendance records shown", "Date and site controls are layout concepts; no location or attendance data is queried.")
    bottom_nav(d, "Time")
    return img


def draw_leave():
    img = Image.new("RGB", (W, H), C["warm50"])
    d = app_chrome(img, "Time")
    y = preview_badge(d)
    y = heading(d, "Leave", "Balances, requests, and approvals", y)
    rounded(d, (20, y, 191, y + 38), 19, C["coral_tint"])
    text(d, (105, y + 19), "Overview", 11, C["coral_dark"], True, anchor="mm")
    rounded(d, (199, y, W - 20, y + 38), 19, C["white"], C["warm200"])
    text(d, (294, y + 19), "Requests", 11, C["warm700"], True, anchor="mm")
    y += 52
    gap = 10
    cw = (W - 40 - gap) // 2
    metric(d, (20, y, 20 + cw, y + 84), "AVAILABLE")
    metric(d, (30 + cw, y, W - 20, y + 84), "PENDING")
    y += 99
    rounded(d, (20, y, W - 20, y + 48), 15, C["coral"])
    text(d, (W // 2, y + 24), "New leave request", 13, C["white"], True, anchor="mm")
    y += 63
    text(d, (20, y), "Recent requests", 15, C["ink_deep"], True)
    empty_card(d, (20, y + 29, W - 20, 630), "No leave entries shown", "Requests and approvals remain unconnected until their workflows and permissions are reviewed.")
    bottom_nav(d, "Time")
    return img


def draw_communications():
    img = Image.new("RGB", (W, H), C["warm50"])
    d = app_chrome(img, "More")
    y = preview_badge(d)
    y = heading(d, "HR Communications", "Announcements, policies, and letters", y)
    labels = (("All", 20, 65), ("Updates", 91, 90), ("Policies", 187, 88), ("Letters", 281, 88))
    for label, x, ww in labels:
        active = label == "All"
        rounded(d, (x, y, x + ww, y + 36), 18, C["coral_tint"] if active else C["white"], None if active else C["warm200"])
        text(d, (x + ww // 2, y + 18), label, 10, C["coral_dark"] if active else C["warm700"], True, anchor="mm")
    y += 53
    rounded(d, (20, y, W - 20, y + 72), 16, C["warm100"], C["warm100"])
    text(d, (36, y + 15), "Sharing stays user-initiated", 12, C["coral_dark"], True)
    wrap(d, "A handoff is not a sent or delivered message.", 36, y + 39, W - 72, 11, C["warm700"], max_lines=2)
    y += 88
    text(d, (20, y), "Latest", 15, C["ink_deep"], True)
    empty_card(d, (20, y + 29, W - 20, 580), "No communications shown", "No announcements, policy content, letters, recipient, or delivery record is included in this preview.")
    bottom_nav(d, "More")
    return img


def draw_employee_detail():
    img = Image.new("RGB", (W, H), C["warm50"])
    d = app_chrome(img, "People", detail=True)
    y = preview_badge(d)
    y = heading(d, "Employee profile", "People  /  Details", y)
    card(d, (20, y, W - 20, y + 118), radius=18)
    rounded(d, (36, y + 22, 92, y + 78), 28, C["warm100"])
    text(d, (64, y + 50), "—", 20, C["warm700"], True, anchor="mm")
    text(d, (108, y + 28), "No profile loaded", 13, C["ink"], True)
    text(d, (108, y + 54), "Role —   ·   Department —", 10, C["warm500"])
    rounded(d, (108, y + 79, 244, y + 104), 13, C["coral_tint"])
    text(d, (176, y + 92), "STATIC PREVIEW", 9, C["coral_dark"], True, anchor="mm")
    y += 137
    text(d, (20, y), "Employment details", 14, C["ink_deep"], True)
    y += 14
    for label in ("Employee code", "Department", "Work email", "Start date"):
        card(d, (20, y + 8, W - 20, y + 51), 12)
        text(d, (34, y + 21), label, 11, C["warm700"])
        text(d, (W - 34, y + 21), "Not shown", 10, C["warm500"], anchor="ra")
        y += 51
    y += 8
    wrap(d, "Production fields require a field-level access review. No person's information is used here.", 20, y, W - 40, 10, C["warm500"], line_gap=4, max_lines=3)
    bottom_nav(d, "People")
    return img


SCREENS = [
    ("01  OVERVIEW", "overview-screen.png", draw_overview),
    ("02  EMPLOYEES", "employees-screen.png", draw_employees),
    ("03  ATTENDANCE", "attendance-screen.png", draw_attendance),
    ("04  LEAVE", "leave-screen.png", draw_leave),
    ("05  COMMUNICATIONS", "communications-screen.png", draw_communications),
    ("06  EMPLOYEE DETAIL", "employee-detail-screen.png", draw_employee_detail),
]


def main():
    rendered = []
    for label, filename, render in SCREENS:
        image = render().convert("RGB")
        image.save(OUT / filename, optimize=True)
        rendered.append((label, image))

    board_w, board_h = 1450, 2100
    board = Image.new("RGB", (board_w, board_h), C["warm100"])
    d = ImageDraw.Draw(board)
    text(d, (48, 38), "HRFlow  /  NATIVE ANDROID", 14, C["coral_dark"], True)
    text(d, (48, 68), "Mobile screen concepts", 34, C["ink_deep"], True)
    wrap(d, "Warm, clear HR workflows — static layout concepts only; no Firebase connection or HR records.", 49, 122, 1000, 15, C["warm700"], line_gap=7)
    rounded(d, (1082, 45, 1398, 91), 23, C["coral_tint"])
    text(d, (1240, 68), "STATIC PREVIEW  ·  NOT LIVE DATA", 10, C["coral_dark"], True, anchor="mm")

    left, top, cell_w, cell_h, gap_x, gap_y = 48, 196, 430, 855, 28, 42
    for index, (label, image) in enumerate(rendered):
        row, col = divmod(index, 3)
        x = left + col * (cell_w + gap_x)
        y = top + row * (cell_h + gap_y)
        text(d, (x + 6, y), label, 12, C["warm700"], True)
        px, py = x + 12, y + 30
        rounded(d, (px - 4, py - 4, px + W + 4, py + H + 4), 35, C["frame"])
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), radius=31, fill=255)
        board.paste(image, (px, py), mask)
        ImageDraw.Draw(board).rounded_rectangle((px, py, px + W - 1, py + H - 1), radius=31, outline=C["warm200"], width=1)

    rounded(d, (48, board_h - 83, board_w - 48, board_h - 38), 14, C["white"], C["warm200"])
    text(d, (66, board_h - 66), "Review note", 10, C["coral_dark"], True)
    text(d, (146, board_h - 66), "Every value is blank or an explicit empty state; screens are proposed, not connected.", 10, C["warm700"])
    board.save(OUT / "hrflow-native-screens.png", optimize=True)
    print(f"Rendered {len(rendered)} screens and contact sheet to {OUT}")


if __name__ == "__main__":
    main()
