"""
╔══════════════════════════════════════════════════════════════╗
║           Driver Drowsiness Detection System                 ║
║                    College Project                           ║
║                                                              ║
║  How it works:                                               ║
║    1. MediaPipe detects 478 face landmarks in real time      ║
║    2. Auto-calibrates EAR threshold to YOUR eyes             ║
║    3. EAR / MAR / PERCLOS / Blink rate / Gaze tracking       ║
║    4. PERCLOS = industry-standard drowsiness metric          ║
║    5. Gaze detects looking away from road                    ║
║                                                              ║
║  Controls:                                                   ║
║    Q  → Quit                                                 ║
║    R  → Reset alerts                                         ║
║    S  → Show/hide stats                                      ║
╚══════════════════════════════════════════════════════════════╝
"""

import cv2
import numpy as np
import time
import threading
import datetime
import os

# ── MediaPipe ─────────────────────────────────────────────────────────────────
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# ── Audio ─────────────────────────────────────────────────────────────────────
try:
    import pygame

    pygame.mixer.init()
    AUDIO_OK = True
except Exception:
    AUDIO_OK = False
    print("[Drowsy] pygame not available — alarm will be terminal bell")


# ──────────────────────────────────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────────────────────────────────
class Config:
    # Camera
    CAM_INDEX = 0
    CAM_W, CAM_H = 1280, 720

    # MediaPipe model
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_URL = (
        "https://storage.googleapis.com/mediapipe-models/"
        "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
    )
    MODEL_PATH = os.path.join(BASE_DIR, "face_landmarker.task")

    # EAR — auto-calibrated at startup, fallback default
    EAR_THRESH = 0.22  # overwritten after calibration
    EAR_CONSEC_FRAMES = 60  # ~1.3s at 15fps
    CALIB_FRAMES = 60  # frames to collect during calibration
    CALIB_MULTIPLIER = 0.75  # threshold = open_ear * this value

    # MAR — Mouth Aspect Ratio
    MAR_THRESH = 0.65
    MAR_CONSEC_FRAMES = 15

    # Head tilt
    NOD_THRESH = 25

    # PERCLOS — Percentage of Eye Closure (industry standard)
    PERCLOS_WINDOW = 900  # frames = ~60s at 15fps
    PERCLOS_THRESH = 0.15  # >15% eyes closed in window = drowsy

    # Blink rate
    BLINK_WINDOW_SEC = 60  # measure blinks per minute
    BLINK_LOW_THRESH = 10  # <10 blinks/min = drowsy (normal = 15-20)
    BLINK_HIGH_THRESH = 30  # >30 blinks/min = fatigued micro-blinks

    # Gaze — iris deviation from eye centre
    GAZE_THRESH = 0.55  # ratio of iris offset to eye width
    GAZE_FRAMES = 60  # frames looking away to trigger alert

    # Alert
    ALERT_COOLDOWN = 5.0

    # Pushbullet phone alerts (free — no credit card)
    # Get token: https://www.pushbullet.com → Account → Access Tokens
    PUSHBULLET_TOKEN = "o.dsO9c2sWKZrWuBBKRCHXPmFcA2b9Tr5Q"  # paste your token here
    PHONE_ALERT_MIN_SEVERITY = 2  # only alert phone after N alerts in session

    # Session report
    REPORTS_DIR = os.path.join(BASE_DIR, "reports")

    # ── Emergency contact ──────────────────────────────────────────────────
    # Fill these in before demo — shown on screen during emergency sequence
    EMERGENCY_CONTACT = {
        "name": "Emergency Contact",  # e.g. "Mom" or "Rahul"
        "phone": "+91 XXXXX XXXXX",  # their phone number
        "relation": "Family",  # e.g. "Father", "Friend"
    }

    # Emergency trigger — eyes closed THIS long = critical emergency
    EMERGENCY_FRAMES = 60  # ~4 seconds at 15fps — driver unconscious
    EMERGENCY_COOLDOWN = 30  # seconds between emergency triggers

    # Colors (BGR)
    GREEN = (50, 220, 50)
    YELLOW = (0, 200, 255)
    RED = (50, 50, 255)
    WHITE = (220, 220, 220)
    DARK = (10, 10, 10)


# ──────────────────────────────────────────────────────────────────────────────
# LANDMARK INDICES — MediaPipe FaceMesh 478 points
# ──────────────────────────────────────────────────────────────────────────────
class Landmarks:
    # Left eye
    LEFT_EYE = [362, 385, 387, 263, 373, 380]
    # Right eye
    RIGHT_EYE = [33, 160, 158, 133, 153, 144]
    # Mouth (for MAR)
    MOUTH = [61, 291, 39, 181, 0, 17, 269, 405]
    # Nose tip + chin for head tilt
    NOSE_TIP = 1
    CHIN = 152
    # Iris centres (MediaPipe outputs these at 468-477)
    LEFT_IRIS = [469, 470, 471, 472]  # left iris ring
    RIGHT_IRIS = [474, 475, 476, 477]  # right iris ring
    # Eye corners for gaze reference
    LEFT_EYE_INNER = 362
    LEFT_EYE_OUTER = 263
    RIGHT_EYE_INNER = 133
    RIGHT_EYE_OUTER = 33


# ──────────────────────────────────────────────────────────────────────────────
# RATIO CALCULATORS
# ──────────────────────────────────────────────────────────────────────────────
def eye_aspect_ratio(landmarks, eye_indices, W, H):
    """
    EAR = (vertical distances) / (2 * horizontal distance)
    When eye is open  → EAR ~ 0.30
    When eye is closed → EAR ~ 0.0
    Reference: Soukupova & Cech, 2016
    """
    pts = []
    for idx in eye_indices:
        lm = landmarks[idx]
        pts.append((lm.x * W, lm.y * H))

    # Vertical distances (p2-p6, p3-p5)
    v1 = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    v2 = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    # Horizontal distance (p1-p4)
    h = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))

    if h == 0:
        return 0.0
    return (v1 + v2) / (2.0 * h)


def mouth_aspect_ratio(landmarks, mouth_indices, W, H):
    """
    MAR = vertical mouth height / horizontal width
    When mouth closed → MAR ~ 0.3
    When yawning      → MAR ~ 0.7+
    """
    pts = []
    for idx in mouth_indices:
        lm = landmarks[idx]
        pts.append((lm.x * W, lm.y * H))

    # Vertical (top lip to bottom lip, two measurements)
    v1 = np.linalg.norm(np.array(pts[2]) - np.array(pts[6]))
    v2 = np.linalg.norm(np.array(pts[3]) - np.array(pts[7]))
    # Horizontal (corner to corner)
    h = np.linalg.norm(np.array(pts[0]) - np.array(pts[1]))

    if h == 0:
        return 0.0
    return (v1 + v2) / (2.0 * h)


def gaze_ratio(landmarks, W, H):
    """
    Measures how far the iris is from the centre of each eye.
    Returns (left_ratio, right_ratio) — 0.5 = looking straight ahead.
    >0.35 offset from centre means looking left or right.
    """

    def iris_centre(iris_indices):
        xs = [landmarks[i].x * W for i in iris_indices]
        ys = [landmarks[i].y * H for i in iris_indices]
        return np.mean(xs), np.mean(ys)

    def eye_width(inner_idx, outer_idx):
        ix = landmarks[inner_idx].x * W
        ox = landmarks[outer_idx].x * W
        return abs(ox - ix)

    try:
        lx, ly = iris_centre(Landmarks.LEFT_IRIS)
        rx, ry = iris_centre(Landmarks.RIGHT_IRIS)

        l_inner_x = landmarks[Landmarks.LEFT_EYE_INNER].x * W
        l_outer_x = landmarks[Landmarks.LEFT_EYE_OUTER].x * W
        r_inner_x = landmarks[Landmarks.RIGHT_EYE_INNER].x * W
        r_outer_x = landmarks[Landmarks.RIGHT_EYE_OUTER].x * W

        l_width = abs(l_outer_x - l_inner_x)
        r_width = abs(r_outer_x - r_inner_x)
        l_centre = (l_inner_x + l_outer_x) / 2
        r_centre = (r_inner_x + r_outer_x) / 2

        l_ratio = (lx - l_centre) / l_width if l_width > 0 else 0
        r_ratio = (rx - r_centre) / r_width if r_width > 0 else 0

        return float(l_ratio), float(r_ratio)
    except Exception:
        return 0.0, 0.0


def is_blink(ear, ear_threshold):
    """True if current EAR is below threshold — simple blink detection."""
    return ear < ear_threshold


def head_tilt_angle(landmarks, W, H):
    """
    Measure how much the head is tilted forward (nodding off).
    Uses nose tip vs chin vertical distance ratio.
    Returns angle in rough units — higher = more forward tilt.
    """
    nose = landmarks[Landmarks.NOSE_TIP]
    chin = landmarks[Landmarks.CHIN]
    dy = (chin.y - nose.y) * H
    dx = (chin.x - nose.x) * W
    if dy == 0:
        return 0.0
    angle = np.degrees(np.arctan2(abs(dx), dy))
    return angle


# ──────────────────────────────────────────────────────────────────────────────
# ALERT SYSTEM
# ──────────────────────────────────────────────────────────────────────────────
class AlertSystem:
    """Manages alerts — drowsy, yawn, nod. Prevents spam with cooldown."""

    def __init__(self):
        self.last_alert = 0.0
        self.alert_count = 0
        self.session_start = time.time()
        self._alarm_thread = None
        self.alert_log = []  # list of {time, reason} for report
        self._phone = None  # set by DrowsinessDetector after init

    def trigger(self, reason):
        now = time.time()
        if now - self.last_alert < Config.ALERT_COOLDOWN:
            return False
        self.last_alert = now
        self.alert_count += 1
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self.alert_log.append({"time": ts, "reason": reason})
        print(f"[ALERT] {reason} — total alerts: {self.alert_count}")
        self._play_alarm()
        # Phone alert after minimum severity threshold
        if self._phone and self.alert_count >= Config.PHONE_ALERT_MIN_SEVERITY:
            self._phone.send(
                "🚨 Driver Drowsiness Alert",
                f"Alert #{self.alert_count}: {reason}\nTime: {ts}",
            )
        return True

    def _play_alarm(self):
        """Play alarm sound in background thread."""

        def _play():
            alarm_path = os.path.join(Config.BASE_DIR, "alarm.wav")
            print(f"[Alarm] Looking for: {alarm_path}")
            print(f"[Alarm] File exists: {os.path.exists(alarm_path)}")
            print(f"[Alarm] AUDIO_OK: {AUDIO_OK}")
            if AUDIO_OK and os.path.exists(alarm_path):
                try:
                    sound = pygame.mixer.Sound(alarm_path)
                    sound.play()
                    return
                except Exception:
                    pass
            # Fallback — terminal bell repeated
            for _ in range(3):
                print("\a", end="", flush=True)
                time.sleep(0.3)

        t = threading.Thread(target=_play, daemon=True)
        t.start()

    def reset(self):
        self.last_alert = 0.0
        self.alert_count = 0
        print("[Alert] Reset")

    def session_duration(self):
        secs = int(time.time() - self.session_start)
        return f"{secs // 60:02d}:{secs % 60:02d}"


# ──────────────────────────────────────────────────────────────────────────────
# PHONE ALERT — Pushbullet
# ──────────────────────────────────────────────────────────────────────────────
class PhoneAlert:
    """
    Sends push notifications to your phone via Pushbullet.
    Free tier — no credit card needed.

    Setup (2 minutes):
        1. Go to https://www.pushbullet.com — sign up free
        2. Install Pushbullet app on your phone
        3. Go to pushbullet.com → Settings → Account → Access Tokens
        4. Copy token → paste into Config.PUSHBULLET_TOKEN
    """

    def __init__(self):
        self._available = bool(Config.PUSHBULLET_TOKEN)
        self._last_sent = 0.0
        self._cooldown = 60.0  # max one phone alert per minute
        if self._available:
            print("[Phone] configured — phone alerts active")
        else:
            print("[Phone] No token — phone alerts disabled")
            print("        Add token to Config.TOKEN to enable")

    def send(self, title, body):
        """Send push notification — non-blocking background thread."""
        if not self._available:
            return
        now = time.time()
        if now - self._last_sent < self._cooldown:
            return
        self._last_sent = now
        threading.Thread(target=self._push, args=(title, body), daemon=True).start()

    def _push(self, title, body):
        try:
            import urllib.request, json as _j

            data = _j.dumps({"type": "note", "title": title, "body": body}).encode()
            req = urllib.request.Request(
                "https://api.pushbullet.com/v2/pushes",
                data=data,
                headers={
                    "Access-Token": Config.PUSHBULLET_TOKEN,
                    "Content-Type": "application/json",
                },
            )
            urllib.request.urlopen(req, timeout=5)
            print(f"[Phone] Alert sent: {title}")
        except Exception as e:
            print(f"[Phone] Alert failed: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# SESSION REPORT — PDF generator
# ──────────────────────────────────────────────────────────────────────────────
class SessionReport:
    """
    Generates a PDF report at end of each drive session.
    Saved to reports/ folder with timestamp filename.
    Uses only built-in Python — no extra libraries needed.
    Falls back to plain text .txt if reportlab not installed.

    For PDF install: pip install reportlab
    """

    def __init__(self):
        os.makedirs(Config.REPORTS_DIR, exist_ok=True)
        try:
            import reportlab

            self._pdf_ok = True
        except ImportError:
            self._pdf_ok = False
            print("[Report] reportlab not installed — saving as .txt")
            print("         For PDF: pip install reportlab")

    def save(self, detector):
        """Generate and save report from completed DrowsinessDetector session."""
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        duration = detector.alert.session_duration()
        alerts = detector.alert.alert_count
        perclos = getattr(detector, "perclos", 0.0)
        blink_r = getattr(detector, "blink_rate", 0)
        ear_thr = getattr(detector, "ear_threshold", Config.EAR_THRESH)
        log = getattr(detector.alert, "alert_log", [])

        if self._pdf_ok:
            path = os.path.join(Config.REPORTS_DIR, f"drive_report_{ts}.pdf")
            self._save_pdf(
                path, ts, duration, alerts, perclos, blink_r, ear_thr, log, detector
            )
        else:
            path = os.path.join(Config.REPORTS_DIR, f"drive_report_{ts}.txt")
            self._save_txt(path, ts, duration, alerts, perclos, blink_r, ear_thr, log)

        print(f"[Report] Saved: {path}")
        return path

    def _save_txt(self, path, ts, duration, alerts, perclos, blink_r, ear_thr, log):
        """Plain text report — always works, no dependencies."""
        with open(path, "w") as f:
            f.write("=" * 50 + "\n")
            f.write("  DRIVER DROWSINESS DETECTION — SESSION REPORT\n")
            f.write("=" * 50 + "\n\n")
            f.write(f"  Date       : {ts[:8]} {ts[9:11]}:{ts[11:13]}\n")
            f.write(f"  Duration   : {duration}\n")
            f.write(f"  Total alerts : {alerts}\n")
            f.write(f"  PERCLOS    : {perclos:.1%}\n")
            f.write(f"  Blink rate : {blink_r:.0f} blinks/min\n")
            f.write(f"  EAR threshold (calibrated): {ear_thr:.3f}\n\n")

            # Safety score
            score = self._safety_score(alerts, perclos, blink_r)
            f.write(f"  Safety score : {score}/100\n")
            f.write(f"  Rating       : {self._rating(score)}\n\n")

            if log:
                f.write("  ALERT TIMELINE:\n")
                f.write("  " + "-" * 40 + "\n")
                for entry in log:
                    f.write(f"  {entry['time']}  |  {entry['reason']}\n")

            f.write("\n" + "=" * 50 + "\n")

    def _save_pdf(
        self, path, ts, duration, alerts, perclos, blink_r, ear_thr, log, detector
    ):
        """Full PDF report with EAR graph."""
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle,
            HRFlowable,
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.graphics.shapes import Drawing, PolyLine, Line, String
        from reportlab.graphics import renderPDF

        doc = SimpleDocTemplate(
            path,
            pagesize=A4,
            leftMargin=2 * cm,
            rightMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )
        styles = getSampleStyleSheet()
        story = []

        # ── Title ─────────────────────────────────────────────────────────
        title_style = ParagraphStyle(
            "title",
            parent=styles["Heading1"],
            fontSize=20,
            textColor=colors.HexColor("#1a1a2e"),
            spaceAfter=6,
        )
        story.append(Paragraph("Driver Drowsiness Detection", title_style))
        story.append(Paragraph("Session Report", styles["Heading2"]))
        story.append(
            HRFlowable(width="100%", thickness=1, color=colors.HexColor("#3498db"))
        )
        story.append(Spacer(1, 0.4 * cm))

        # ── Summary table ─────────────────────────────────────────────────
        score = self._safety_score(alerts, perclos, blink_r)
        rating = self._rating(score)
        score_color = (
            colors.green
            if score >= 80
            else colors.orange if score >= 60 else colors.red
        )

        data = [
            ["Metric", "Value", "Status"],
            ["Date & Time", f"{ts[:8]} {ts[9:11]}:{ts[11:13]}", "—"],
            ["Session Duration", duration, "—"],
            [
                "Total Alerts",
                str(alerts),
                "OK" if alerts <= 2 else "WARNING" if alerts <= 5 else "DANGER",
            ],
            [
                "PERCLOS",
                f"{perclos:.1%}",
                "OK" if perclos < 0.10 else "WARNING" if perclos < 0.15 else "DANGER",
            ],
            [
                "Blink Rate",
                f"{blink_r:.0f}/min",
                "OK" if 10 <= blink_r <= 30 else "WARNING",
            ],
            ["EAR Threshold", f"{ear_thr:.3f}", "Calibrated"],
            ["Safety Score", f"{score}/100", rating],
        ]

        col_w = [5.5 * cm, 4 * cm, 4 * cm]
        tbl = Table(data, colWidths=col_w)
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.HexColor("#f8f9fa"), colors.white],
                    ),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dee2e6")),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("PADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(tbl)
        story.append(Spacer(1, 0.5 * cm))

        # ── EAR trend graph ────────────────────────────────────────────────
        ear_hist = getattr(detector, "ear_history", [])
        if len(ear_hist) > 10:
            story.append(
                Paragraph("EAR Trend (Eye Openness Over Session)", styles["Heading3"])
            )
            gw, gh = 460, 100
            d = Drawing(gw, gh)

            # background
            from reportlab.graphics.shapes import Rect

            d.add(
                Rect(
                    0,
                    0,
                    gw,
                    gh,
                    fillColor=colors.HexColor("#f8f9fa"),
                    strokeColor=colors.HexColor("#dee2e6"),
                )
            )

            # threshold line
            thr_y = int(min(ear_thr / 0.45, 1.0) * gh)
            d.add(
                Line(
                    0,
                    thr_y,
                    gw,
                    thr_y,
                    strokeColor=colors.red,
                    strokeWidth=1,
                    strokeDashArray=[4, 4],
                )
            )

            # EAR line
            hist = ear_hist[-gw:] if len(ear_hist) > gw else ear_hist
            pts = []
            for i, v in enumerate(hist):
                px = int(i * gw / max(len(hist) - 1, 1))
                py = int(min(v / 0.45, 1.0) * gh)
                pts.extend([px, py])

            if len(pts) >= 4:
                d.add(
                    PolyLine(
                        pts, strokeColor=colors.HexColor("#27ae60"), strokeWidth=1.5
                    )
                )

            # label
            d.add(
                String(
                    5,
                    thr_y + 3,
                    f"threshold {ear_thr:.2f}",
                    fontSize=7,
                    fillColor=colors.red,
                )
            )
            story.append(d)
            story.append(Spacer(1, 0.4 * cm))

        # ── Alert timeline ─────────────────────────────────────────────────
        if log:
            story.append(Paragraph("Alert Timeline", styles["Heading3"]))
            log_data = [["Time", "Alert Reason"]]
            for entry in log:
                log_data.append([entry["time"], entry["reason"]])
            log_tbl = Table(log_data, colWidths=[3 * cm, 10.5 * cm])
            log_tbl.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e74c3c")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        (
                            "ROWBACKGROUNDS",
                            (0, 1),
                            (-1, -1),
                            [colors.HexColor("#fdecea"), colors.white],
                        ),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dee2e6")),
                        ("PADDING", (0, 0), (-1, -1), 5),
                    ]
                )
            )
            story.append(log_tbl)

        # ── Footer ────────────────────────────────────────────────────────
        story.append(Spacer(1, 1 * cm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
        story.append(
            Paragraph(
                "Generated by Driver Drowsiness Detection System — College Project",
                styles["Normal"],
            )
        )

        doc.build(story)

    @staticmethod
    def _safety_score(alerts, perclos, blink_r):
        """0-100 score — higher is safer."""
        score = 100
        score -= min(alerts * 10, 40)
        score -= min(int(perclos * 200), 30)
        if blink_r < 10:
            score -= 20
        elif blink_r > 30:
            score -= 10
        return max(0, score)

    @staticmethod
    def _rating(score):
        if score >= 80:
            return "SAFE"
        if score >= 60:
            return "CAUTION"
        if score >= 40:
            return "WARNING"
        return "DANGEROUS"


# ──────────────────────────────────────────────────────────────────────────────
# EMERGENCY SYSTEM
# ──────────────────────────────────────────────────────────────────────────────
class EmergencySystem:
    """
    Triggered when driver is unresponsive for EMERGENCY_FRAMES consecutive frames.
    For DEMO — shows the full emergency sequence on screen.
    In production — replace _send_sms() and _send_location() with real APIs
    (Twilio, Fast2SMS, etc.)

    Emergency sequence:
        1. Full screen RED alert overlay
        2. Countdown 5 seconds — giving driver chance to respond
        3. If no response → simulate contacting emergency contact
        4. Show simulated SMS sent + location shared
        5. Log everything to file
    """

    def __init__(self):
        self.active = False  # True during emergency sequence
        self.last_triggered = 0.0
        self.countdown = 0  # countdown seconds remaining
        self.countdown_start = 0.0
        self.phase = "IDLE"  # IDLE → COUNTDOWN → CONTACTING → DONE
        self._log_path = os.path.join(Config.BASE_DIR, "emergency_log.txt")
        # Simulated GPS location (in real version use GPS module / phone GPS)
        self._location = self._fetch_location()

    def _fetch_location(self):
        """
        Fetch real location via ip-api.com — free, no API key needed.
        Falls back to default if no internet connection.
        """
        try:
            import urllib.request, json as _j

            resp = urllib.request.urlopen("http://ip-api.com/json/", timeout=3)
            data = _j.loads(resp.read())
            if data.get("status") == "success":
                lat = data.get("lat", 0.0)
                lng = data.get("lon", 0.0)
                city = data.get("city", "Unknown City")
                region = data.get("regionName", "")
                country = data.get("country", "")
                address = f"{city}, {region}, {country}"
                print(f"[Emergency] Location fetched: {address} ({lat}, {lng})")
                return {"lat": lat, "lng": lng, "address": address}
        except Exception as e:
            print(f"[Emergency] Location fetch failed: {e} — using default")
        # Fallback if no internet
        return {"lat": 0.0, "lng": 0.0, "address": "Location unavailable"}

    def trigger(self):
        """Called when driver is unresponsive. Starts emergency sequence."""
        now = time.time()
        if now - self.last_triggered < Config.EMERGENCY_COOLDOWN:
            return
        self.last_triggered = now
        self.active = True
        self.countdown = 5
        self.countdown_start = now
        self.phase = "COUNTDOWN"
        print("[EMERGENCY] Driver unresponsive — starting emergency sequence!")
        self._log("EMERGENCY TRIGGERED — driver unresponsive")

    def cancel(self):
        """Driver responded — cancel emergency."""
        if self.active and self.phase == "COUNTDOWN":
            self.active = False
            self.phase = "IDLE"
            self._log("Emergency CANCELLED — driver responded")
            print("[EMERGENCY] Cancelled — driver responded")
            return True
        return False

    def update(self):
        """
        Call every frame — advances the emergency sequence.
        Returns current phase string for HUD to display.
        """
        if not self.active:
            return "IDLE"

        now = time.time()
        elapsed = now - self.countdown_start

        if self.phase == "COUNTDOWN":
            remaining = max(0, 5 - int(elapsed))
            self.countdown = remaining
            if remaining <= 0:
                self.phase = "CONTACTING"
                self.countdown_start = now
                # Fire in background thread
                threading.Thread(target=self._run_sequence, daemon=True).start()

        elif self.phase == "CONTACTING":
            if elapsed > 6:  # sequence takes ~6 seconds to simulate
                self.phase = "DONE"

        elif self.phase == "DONE":
            if elapsed > 5:  # show DONE for 5 seconds
                self.active = False
                self.phase = "IDLE"

        return self.phase

    def _run_sequence(self):
        """
        Simulated emergency response sequence.
        In production replace the print statements with real API calls.
        """
        contact = Config.EMERGENCY_CONTACT
        loc = self._location
        ts = datetime.datetime.now().strftime("%H:%M:%S")

        # Step 1 — simulate SMS
        time.sleep(1)
        sms_text = (
            f"EMERGENCY ALERT: {contact['name']}, "
            f"the driver may be in danger. "
            f"Last known location: {loc['address']}. "
            f"Time: {ts}. Please call immediately!"
        )
        print(f"[EMERGENCY] Simulating SMS to {contact['phone']}")
        print(f"[EMERGENCY] Message: {sms_text}")
        self._log(f"SMS simulated to {contact['phone']}: {sms_text}")

        # Step 2 — simulate location share
        time.sleep(1.5)
        maps_link = f"https://maps.google.com/?q=" f"{loc['lat']},{loc['lng']}"
        print(f"[EMERGENCY] Simulating location share: {maps_link}")
        self._log(f"Location shared: {maps_link}")

        # Step 3 — log everything
        time.sleep(0.5)
        self._log(f"Emergency sequence complete — {contact['name']} notified")
        print("[EMERGENCY] Sequence complete")

    def _log(self, message):
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(self._log_path, "a") as f:
            f.write(f"[{ts}] {message}\n")

    def draw(self, frame, W, H):
        """
        Draw the emergency overlay on frame.
        Different visuals for each phase of the sequence.
        """
        if not self.active:
            return

        if self.phase == "COUNTDOWN":
            self._draw_countdown(frame, W, H)
        elif self.phase == "CONTACTING":
            self._draw_contacting(frame, W, H)
        elif self.phase == "DONE":
            self._draw_done(frame, W, H)

    def _draw_countdown(self, frame, W, H):
        """Red pulsing overlay with countdown — driver can press C to cancel."""
        # Dark red overlay
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (W, H), (0, 0, 180), -1)
        alpha = 0.45 + 0.1 * (int(time.time() * 4) % 2)  # pulse
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)

        # Main warning
        self._centre_text(
            frame, W, H // 2 - 120, "DRIVER UNRESPONSIVE!", 1.1, (50, 50, 255), 2
        )

        # Countdown number — large
        num = str(self.countdown)
        (tw, th), _ = cv2.getTextSize(num, cv2.FONT_HERSHEY_SIMPLEX, 5.0, 8)
        cv2.putText(
            frame,
            num,
            (W // 2 - tw // 2, H // 2 + th // 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            5.0,
            (255, 255, 255),
            8,
            cv2.LINE_AA,
        )

        self._centre_text(
            frame,
            W,
            H // 2 + 120,
            "Contacting emergency contact in...",
            0.65,
            (200, 200, 200),
            1,
        )

        # Cancel instruction
        cv2.rectangle(
            frame, (W // 2 - 200, H - 80), (W // 2 + 200, H - 20), (30, 30, 30), -1
        )
        cv2.rectangle(
            frame, (W // 2 - 200, H - 80), (W // 2 + 200, H - 20), (100, 100, 100), 1
        )
        self._centre_text(
            frame,
            W,
            H - 38,
            "Press C if you are OK — to cancel",
            0.55,
            (100, 220, 100),
            1,
        )

        # Contact info
        c = Config.EMERGENCY_CONTACT
        self._centre_text(
            frame,
            W,
            H // 2 + 165,
            f"Will contact: {c['name']} ({c['relation']}) — {c['phone']}",
            0.5,
            (180, 180, 180),
            1,
        )

    def _draw_contacting(self, frame, W, H):
        """Shows simulated sequence — SMS sending, location sharing."""
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (W, H), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

        c = Config.EMERGENCY_CONTACT
        loc = self._location
        now = time.time()
        elapsed = now - self.countdown_start

        self._centre_text(
            frame, W, 80, "EMERGENCY RESPONSE ACTIVATED", 0.8, (50, 50, 255), 2
        )

        # Step 1 — SMS
        sms_col = Config.GREEN if elapsed > 1.0 else (100, 100, 100)
        sms_pfx = "[SENT]" if elapsed > 1.0 else "[SENDING...]"
        self._centre_text(
            frame,
            W,
            160,
            f"{sms_pfx} SMS to {c['name']} — {c['phone']}",
            0.55,
            sms_col,
            1,
        )

        if elapsed > 1.0:
            self._centre_text(
                frame,
                W,
                190,
                '"EMERGENCY: Driver may be in danger. Please call immediately!"',
                0.42,
                (150, 150, 150),
                1,
            )

        # Step 2 — Location
        loc_col = Config.GREEN if elapsed > 2.5 else (100, 100, 100)
        loc_pfx = "[SHARED]" if elapsed > 2.5 else "[SHARING...]"
        self._centre_text(
            frame, W, 240, f"{loc_pfx} Location → {loc['address']}", 0.55, loc_col, 1
        )

        if elapsed > 2.5:
            self._centre_text(
                frame,
                W,
                268,
                f"GPS: {loc['lat']}, {loc['lng']}",
                0.42,
                (150, 150, 150),
                1,
            )

        # Step 3 — Log
        log_col = Config.GREEN if elapsed > 4.0 else (100, 100, 100)
        log_pfx = "[LOGGED]" if elapsed > 4.0 else "[LOGGING...]"
        self._centre_text(
            frame,
            W,
            310,
            f"{log_pfx} Emergency event recorded to file",
            0.55,
            log_col,
            1,
        )

        # Contact card
        card_y = H // 2 + 20
        cv2.rectangle(
            frame, (W // 2 - 220, card_y), (W // 2 + 220, card_y + 90), (20, 20, 20), -1
        )
        cv2.rectangle(
            frame, (W // 2 - 220, card_y), (W // 2 + 220, card_y + 90), (50, 50, 255), 2
        )
        self._centre_text(
            frame, W, card_y + 26, f"EMERGENCY CONTACT", 0.5, (50, 50, 255), 1
        )
        self._centre_text(
            frame,
            W,
            card_y + 52,
            f"{c['name']}  ({c['relation']})",
            0.65,
            (220, 220, 220),
            1,
        )
        self._centre_text(frame, W, card_y + 76, c["phone"], 0.55, (100, 220, 100), 1)

        # Note
        self._centre_text(
            frame,
            W,
            H - 40,
            "[ DEMO MODE — Connect SMS API to activate real alerts ]",
            0.42,
            (80, 80, 80),
            1,
        )

    def _draw_done(self, frame, W, H):
        """Shows confirmation that emergency was handled."""
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (W, H), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

        c = Config.EMERGENCY_CONTACT
        self._centre_text(
            frame, W, H // 2 - 80, "EMERGENCY CONTACT NOTIFIED", 0.9, Config.GREEN, 2
        )
        self._centre_text(
            frame,
            W,
            H // 2 - 30,
            f"{c['name']} has been alerted",
            0.6,
            (200, 200, 200),
            1,
        )
        self._centre_text(
            frame,
            W,
            H // 2 + 10,
            f"Location shared — help is on the way",
            0.6,
            (200, 200, 200),
            1,
        )
        self._centre_text(
            frame,
            W,
            H // 2 + 60,
            "Event logged to emergency_log.txt",
            0.5,
            (100, 100, 100),
            1,
        )

    @staticmethod
    def _centre_text(frame, W, y, text, scale, color, thick):
        (tw, _), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thick)
        cv2.putText(
            frame,
            text,
            (W // 2 - tw // 2, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            scale,
            color,
            thick,
            cv2.LINE_AA,
        )


# ──────────────────────────────────────────────────────────────────────────────
# HUD RENDERER
# ──────────────────────────────────────────────────────────────────────────────
class DrowsinessHUD:
    """All on-screen drawing for the drowsiness system."""

    @staticmethod
    def draw_eye_landmarks(frame, landmarks, eye_indices, W, H, color):
        pts = []
        for idx in eye_indices:
            lm = landmarks[idx]
            x, y = int(lm.x * W), int(lm.y * H)
            pts.append((x, y))
            cv2.circle(frame, (x, y), 2, color, -1, cv2.LINE_AA)
        # Draw eye outline
        pts = np.array(pts, dtype=np.int32)
        cv2.polylines(
            frame, [pts], isClosed=True, color=color, thickness=1, lineType=cv2.LINE_AA
        )

    @staticmethod
    def draw_mouth_landmarks(frame, landmarks, mouth_indices, W, H, color):
        for idx in mouth_indices:
            lm = landmarks[idx]
            x, y = int(lm.x * W), int(lm.y * H)
            cv2.circle(frame, (x, y), 2, color, -1, cv2.LINE_AA)

    @staticmethod
    def draw_gauge(
        frame,
        x,
        y,
        w,
        h,
        value,
        max_val,
        label,
        warn_thresh,
        danger_thresh,
        invert=False,
    ):
        """
        Horizontal gauge bar for EAR / MAR values.
        invert=True means HIGH value is bad (MAR — more open = danger)
        invert=False means LOW value is bad (EAR — more closed = danger)
        """
        # Background
        cv2.rectangle(frame, (x, y), (x + w, y + h), (30, 30, 30), -1)
        cv2.rectangle(frame, (x, y), (x + w, y + h), (60, 60, 60), 1)

        # Fill
        ratio = min(value / max_val, 1.0)
        fill = int(w * ratio)

        if invert:
            danger = value > danger_thresh
            warn = value > warn_thresh
        else:
            danger = value < danger_thresh
            warn = value < warn_thresh

        color = Config.RED if danger else (Config.YELLOW if warn else Config.GREEN)
        cv2.rectangle(frame, (x, y), (x + fill, y + h), color, -1)

        # Label + value
        cv2.putText(
            frame,
            f"{label}: {value:.2f}",
            (x, y - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.42,
            Config.WHITE,
            1,
            cv2.LINE_AA,
        )

    @staticmethod
    def draw_status_pill(frame, W, H, text, color, sub=""):
        """Large centred alert pill — shown when drowsy."""
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale = 1.1
        thick = 2
        (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
        pad = 24
        cx = W // 2
        cy = H // 2 - 60

        # Dark pill background
        cv2.rectangle(
            frame,
            (cx - tw // 2 - pad, cy - th - pad),
            (cx + tw // 2 + pad, cy + pad),
            (10, 10, 10),
            -1,
        )
        cv2.rectangle(
            frame,
            (cx - tw // 2 - pad, cy - th - pad),
            (cx + tw // 2 + pad, cy + pad),
            color,
            2,
        )
        cv2.putText(
            frame, text, (cx - tw // 2, cy), font, scale, color, thick, cv2.LINE_AA
        )

        if sub:
            (sw, _), _ = cv2.getTextSize(sub, font, 0.5, 1)
            cv2.putText(
                frame, sub, (cx - sw // 2, cy + 28), font, 0.5, color, 1, cv2.LINE_AA
            )

    @staticmethod
    def draw_top_bar(
        frame, W, state, ear, mar, alert_count, session_time, perclos=0.0, blink_rate=0
    ):
        """Top status bar with live metrics."""
        cv2.rectangle(frame, (0, 0), (W, 48), Config.DARK, -1)

        status_colors = {
            "ALERT": Config.RED,
            "YAWNING": Config.YELLOW,
            "NODDING": Config.YELLOW,
            "DISTRACTED": Config.YELLOW,
            "EMERGENCY": (50, 50, 255),
            "LOW BLINK": Config.YELLOW,
            "ACTIVE": Config.GREEN,
            "CALIBRATING": (120, 120, 120),
            "NO FACE": (100, 100, 100),
        }
        col = status_colors.get(state, Config.WHITE)
        cv2.putText(
            frame,
            f"STATUS: {state}",
            (14, 32),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            col,
            1,
            cv2.LINE_AA,
        )

        # Metrics centre
        cv2.putText(
            frame,
            f"EAR:{ear:.2f}  MAR:{mar:.2f}  PERCLOS:{perclos:.0%}  Blinks:{blink_rate}/min",
            (W // 2 - 200, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (120, 120, 120),
            1,
            cv2.LINE_AA,
        )

        # Session info right
        cv2.putText(
            frame,
            f"Alerts: {alert_count}  |  {session_time}",
            (W - 220, 32),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (100, 100, 100),
            1,
            cv2.LINE_AA,
        )

    @staticmethod
    def draw_bottom_bar(frame, W, H):
        cv2.rectangle(frame, (0, H - 30), (W, H), Config.DARK, -1)
        cv2.putText(
            frame,
            "Q: Quit   R: Reset   S: Stats   C: Cancel emergency",
            (10, H - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.42,
            (80, 80, 80),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            "Driver Drowsiness Detection — College POC",
            (W - 380, H - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (50, 50, 50),
            1,
            cv2.LINE_AA,
        )

    @staticmethod
    def draw_calibration(frame, W, H, progress):
        """Full screen calibration overlay — shown at startup."""
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (W, H), (5, 5, 5), -1)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

        cx, cy = W // 2, H // 2
        radius = 100
        sweep = int(progress * 360)

        # Progress arc
        cv2.ellipse(
            frame,
            (cx, cy),
            (radius, radius),
            -90,
            0,
            sweep,
            Config.GREEN,
            6,
            cv2.LINE_AA,
        )
        cv2.circle(frame, (cx, cy), radius, (40, 40, 40), 6, cv2.LINE_AA)

        # Percentage text
        pct = f"{int(progress * 100)}%"
        (pw, ph), _ = cv2.getTextSize(pct, cv2.FONT_HERSHEY_SIMPLEX, 1.2, 2)
        cv2.putText(
            frame,
            pct,
            (cx - pw // 2, cy + ph // 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.2,
            Config.GREEN,
            2,
            cv2.LINE_AA,
        )

        # Instructions
        lines = [
            "CALIBRATING YOUR EYE BASELINE",
            "Keep eyes open and look at the camera",
            "Do not blink excessively",
        ]
        for i, line in enumerate(lines):
            (lw, _), _ = cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
            y = cy - radius - 50 + i * 28 - 30
            cv2.putText(
                frame,
                line,
                (cx - lw // 2, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                Config.WHITE if i == 0 else (120, 120, 120),
                1,
                cv2.LINE_AA,
            )

    @staticmethod
    def draw_stats(frame, W, H, ear_history, mar_history):
        """Mini graph of recent EAR values — shows drowsiness trend."""
        if len(ear_history) < 2:
            return
        gx, gy, gw, gh = 20, H - 120, 200, 80
        cv2.rectangle(frame, (gx, gy), (gx + gw, gy + gh), (15, 15, 15), -1)
        cv2.rectangle(frame, (gx, gy), (gx + gw, gy + gh), (40, 40, 40), 1)
        cv2.putText(
            frame,
            "EAR trend",
            (gx, gy - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.35,
            (80, 80, 80),
            1,
        )

        # Threshold line
        ty = gy + gh - int(Config.EAR_THRESH / 0.4 * gh)
        cv2.line(frame, (gx, ty), (gx + gw, ty), Config.RED, 1)

        # Plot EAR values
        pts = []
        hist = list(ear_history)[-gw:]
        for i, val in enumerate(hist):
            px = gx + int(i * gw / max(len(hist) - 1, 1))
            py = gy + gh - int(min(val, 0.4) / 0.4 * gh)
            pts.append((px, py))
        if len(pts) > 1:
            cv2.polylines(
                frame,
                [np.array(pts, dtype=np.int32)],
                False,
                Config.GREEN,
                1,
                cv2.LINE_AA,
            )


# ──────────────────────────────────────────────────────────────────────────────
# MAIN DETECTOR
# ──────────────────────────────────────────────────────────────────────────────
class DrowsinessDetector:
    """Main system — ties everything together."""

    def __init__(self):
        print("\n" + "=" * 56)
        print("  Driver Drowsiness Detection — Starting up")
        print("=" * 56 + "\n")

        self.alert = AlertSystem()
        self.hud = DrowsinessHUD()
        self.landmarker = self._init_landmarker()

        # ── Frame counters ────────────────────────────────────────────────
        self.eye_closed_frames = 0
        self.yawn_frames = 0
        self.nod_frames = 0
        self.gaze_away_frames = 0

        # ── Calibration ───────────────────────────────────────────────────
        self.calibrating = True
        self.calib_ears = []  # EAR samples during calibration
        self.ear_threshold = Config.EAR_THRESH  # updated after calib
        self.calib_frame_count = 0

        # ── PERCLOS (% eye closure over rolling window) ───────────────────
        # 1 = closed, 0 = open — rolling window of last N frames
        self.perclos_window = []
        self.perclos = 0.0

        # ── Blink rate tracking ───────────────────────────────────────────
        self.blink_times = []  # timestamps of each blink
        self.was_blinking = False  # True if eye was closed last frame
        self.blink_rate = 0.0  # blinks per minute

        # ── Gaze tracking ─────────────────────────────────────────────────
        self.gaze_direction = "CENTRE"  # CENTRE / LEFT / RIGHT
        self.gaze_away_frames = 0

        # ── History for graphs ────────────────────────────────────────────
        self.ear_history = []
        self.mar_history = []
        self.perclos_hist = []
        self.max_history = 300

        # ── FPS ───────────────────────────────────────────────────────────
        self.fps = 0.0
        self.fps_counter = 0
        self.fps_timer = time.time()

        # ── UI ────────────────────────────────────────────────────────────
        # Phone alerts + session report
        self.phone = PhoneAlert()
        self.report = SessionReport()
        self.alert._phone = self.phone

        # Emergency system
        self.emergency = EmergencySystem()
        self._emergency_triggered = False

        self.show_stats = True
        self.state = "CALIBRATING"

    def _init_landmarker(self):
        """Download model if needed and init MediaPipe FaceLandmarker."""
        import urllib.request

        if not os.path.exists(Config.MODEL_PATH):
            print("[Drowsy] Downloading FaceLandmarker model (~30 MB)...")
            urllib.request.urlretrieve(Config.MODEL_URL, Config.MODEL_PATH)
            print("[Drowsy] Model downloaded.")

        base_opts = mp_python.BaseOptions(model_asset_path=Config.MODEL_PATH)
        opts = vision.FaceLandmarkerOptions(
            base_options=base_opts,
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        print("[Drowsy] FaceLandmarker ready")
        return vision.FaceLandmarker.create_from_options(opts)

    def run(self):
        cap = cv2.VideoCapture(Config.CAM_INDEX)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, Config.CAM_W)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, Config.CAM_H)

        W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"[Drowsy] Camera: {W}x{H}")
        print("[Drowsy] Running — press Q to quit\n")

        while True:
            ok, frame = cap.read()
            if not ok:
                continue

            frame = cv2.flip(frame, 1)
            ts_ms = int(cap.get(cv2.CAP_PROP_POS_MSEC))

            # ── Run FaceLandmarker ─────────────────────────────────────────
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = self.landmarker.detect_for_video(mp_img, ts_ms)

            ear = 0.0
            mar = 0.0

            if result.face_landmarks:
                lms = result.face_landmarks[0]

                # ── Core metrics ───────────────────────────────────────────
                ear_l = eye_aspect_ratio(lms, Landmarks.LEFT_EYE, W, H)
                ear_r = eye_aspect_ratio(lms, Landmarks.RIGHT_EYE, W, H)
                ear = (ear_l + ear_r) / 2.0
                mar = mouth_aspect_ratio(lms, Landmarks.MOUTH, W, H)
                tilt = head_tilt_angle(lms, W, H)

                # ── Gaze ──────────────────────────────────────────────────
                l_gaze, r_gaze = gaze_ratio(lms, W, H)
                avg_gaze = (l_gaze + r_gaze) / 2.0
                if avg_gaze < -Config.GAZE_THRESH:
                    self.gaze_direction = "LEFT"
                elif avg_gaze > Config.GAZE_THRESH:
                    self.gaze_direction = "RIGHT"
                else:
                    self.gaze_direction = "CENTRE"

                # ── Calibration phase ──────────────────────────────────────
                if self.calibrating:
                    self.calib_ears.append(ear)
                    self.calib_frame_count += 1
                    pct = self.calib_frame_count / Config.CALIB_FRAMES
                    self.hud.draw_calibration(frame, W, H, pct)
                    if self.calib_frame_count >= Config.CALIB_FRAMES:
                        # Set threshold as % of average open-eye EAR
                        avg_open = float(np.mean(self.calib_ears))
                        self.ear_threshold = round(
                            avg_open * Config.CALIB_MULTIPLIER, 3
                        )
                        Config.EAR_THRESH = self.ear_threshold
                        self.calibrating = False
                        self.state = "ACTIVE"
                        print(
                            f"[Drowsy] Calibration done — EAR threshold set to {self.ear_threshold:.3f} (your open-eye avg: {avg_open:.3f})"
                        )
                    continue  # skip detection during calibration

                # ── PERCLOS update ─────────────────────────────────────────
                eye_closed = ear < self.ear_threshold
                self.perclos_window.append(1 if eye_closed else 0)
                if len(self.perclos_window) > Config.PERCLOS_WINDOW:
                    self.perclos_window.pop(0)
                self.perclos = sum(self.perclos_window) / len(self.perclos_window)

                # ── Blink rate tracking ────────────────────────────────────
                now = time.time()
                if eye_closed and not self.was_blinking:
                    # Leading edge of blink
                    self.blink_times.append(now)
                    self.was_blinking = True
                elif not eye_closed:
                    self.was_blinking = False

                # Keep only blinks from last 60 seconds
                self.blink_times = [
                    t for t in self.blink_times if now - t <= Config.BLINK_WINDOW_SEC
                ]
                self.blink_rate = len(self.blink_times)  # blinks per min

                # ── Update histories ───────────────────────────────────────
                self.ear_history.append(ear)
                self.mar_history.append(mar)
                self.perclos_hist.append(self.perclos)
                for h in [self.ear_history, self.mar_history, self.perclos_hist]:
                    if len(h) > self.max_history:
                        h.pop(0)

                # ── Draw landmarks ─────────────────────────────────────────
                eye_col = Config.RED if eye_closed else Config.GREEN
                self.hud.draw_eye_landmarks(
                    frame, lms, Landmarks.LEFT_EYE, W, H, eye_col
                )
                self.hud.draw_eye_landmarks(
                    frame, lms, Landmarks.RIGHT_EYE, W, H, eye_col
                )
                mar_col = Config.YELLOW if mar > Config.MAR_THRESH else Config.GREEN
                self.hud.draw_mouth_landmarks(
                    frame, lms, Landmarks.MOUTH, W, H, mar_col
                )

                # Draw gaze indicator dot on each iris
                for iris_idx in Landmarks.LEFT_IRIS + Landmarks.RIGHT_IRIS:
                    lm = lms[iris_idx]
                    ix, iy = int(lm.x * W), int(lm.y * H)
                    gcol = (
                        Config.YELLOW
                        if self.gaze_direction != "CENTRE"
                        else Config.GREEN
                    )
                    cv2.circle(frame, (ix, iy), 2, gcol, -1, cv2.LINE_AA)

                # ── State machine ──────────────────────────────────────────
                self.state = "ACTIVE"

                # Eye closure counter
                if eye_closed:
                    self.eye_closed_frames += 1
                else:
                    self.eye_closed_frames = 0

                # Yawn counter
                if mar > Config.MAR_THRESH:
                    self.yawn_frames += 1
                else:
                    self.yawn_frames = 0

                # Nod counter
                if tilt > Config.NOD_THRESH:
                    self.nod_frames += 1
                else:
                    self.nod_frames = 0

                # Gaze away counter
                if self.gaze_direction != "CENTRE":
                    self.gaze_away_frames += 1
                else:
                    self.gaze_away_frames = 0

                # ── Alerts (priority order) ────────────────────────────────
                # ── Critical emergency — eyes closed way too long ────────
                if self.eye_closed_frames >= Config.EMERGENCY_FRAMES:
                    self.state = "EMERGENCY"
                    self.emergency.trigger()

                elif self.eye_closed_frames >= Config.EAR_CONSEC_FRAMES:
                    self.state = "ALERT"
                    self.alert.trigger("Eyes closed too long")
                    self.hud.draw_status_pill(
                        frame,
                        W,
                        H,
                        "DROWSINESS ALERT!",
                        Config.RED,
                        f"Eyes closed {self.eye_closed_frames} frames — WAKE UP!",
                    )

                elif self.perclos > Config.PERCLOS_THRESH:
                    self.state = "ALERT"
                    self.alert.trigger(
                        f"PERCLOS {self.perclos:.1%} — chronic drowsiness"
                    )
                    self.hud.draw_status_pill(
                        frame,
                        W,
                        H,
                        "HIGH PERCLOS!",
                        Config.RED,
                        f"Eyes closed {self.perclos:.0%} of last minute",
                    )

                elif self.yawn_frames >= Config.MAR_CONSEC_FRAMES:
                    self.state = "YAWNING"
                    self.alert.trigger("Yawning detected")
                    self.hud.draw_status_pill(
                        frame,
                        W,
                        H,
                        "YAWNING DETECTED",
                        Config.YELLOW,
                        "Please take a break",
                    )

                elif self.nod_frames >= 10:
                    self.state = "NODDING"
                    self.alert.trigger("Head nodding — microsleep risk")
                    self.hud.draw_status_pill(
                        frame, W, H, "HEAD NODDING!", Config.YELLOW, "Microsleep risk"
                    )

                elif self.gaze_away_frames >= Config.GAZE_FRAMES:
                    self.state = "DISTRACTED"
                    self.alert.trigger(f"Looking {self.gaze_direction}")
                    self.hud.draw_status_pill(
                        frame,
                        W,
                        H,
                        f"LOOKING {self.gaze_direction}!",
                        Config.YELLOW,
                        "Keep eyes on road",
                    )

                elif (
                    self.blink_rate < Config.BLINK_LOW_THRESH
                    and len(self.blink_times) > 0
                ):
                    self.state = "LOW BLINK"

                # ── Gauges ─────────────────────────────────────────────────
                gx = W - 230
                self.hud.draw_gauge(
                    frame,
                    gx,
                    58,
                    210,
                    14,
                    ear,
                    0.45,
                    f"EAR (thr:{self.ear_threshold:.2f})",
                    self.ear_threshold + 0.04,
                    self.ear_threshold,
                    invert=False,
                )
                self.hud.draw_gauge(
                    frame,
                    gx,
                    82,
                    210,
                    14,
                    mar,
                    1.0,
                    "MAR (yawn)",
                    Config.MAR_THRESH - 0.1,
                    Config.MAR_THRESH,
                    invert=True,
                )
                self.hud.draw_gauge(
                    frame,
                    gx,
                    106,
                    210,
                    14,
                    self.perclos,
                    0.3,
                    f"PERCLOS",
                    Config.PERCLOS_THRESH * 0.7,
                    Config.PERCLOS_THRESH,
                    invert=True,
                )

                # Blink rate display
                br_col = (
                    Config.RED
                    if self.blink_rate < Config.BLINK_LOW_THRESH
                    else (
                        Config.YELLOW
                        if self.blink_rate > Config.BLINK_HIGH_THRESH
                        else Config.GREEN
                    )
                )
                cv2.putText(
                    frame,
                    f"Blinks/min: {self.blink_rate}",
                    (gx, 132),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    br_col,
                    1,
                    cv2.LINE_AA,
                )

                # Gaze display
                gz_col = (
                    Config.YELLOW if self.gaze_direction != "CENTRE" else Config.GREEN
                )
                cv2.putText(
                    frame,
                    f"Gaze: {self.gaze_direction}",
                    (gx, 148),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.38,
                    gz_col,
                    1,
                    cv2.LINE_AA,
                )

                # Eye closure progress bar
                if self.eye_closed_frames > 0:
                    pct = min(self.eye_closed_frames / Config.EAR_CONSEC_FRAMES, 1.0)
                    bw = int((W - 40) * pct)
                    col = Config.RED if pct > 0.7 else Config.YELLOW
                    cv2.rectangle(frame, (20, 56), (20 + bw, 68), col, -1)
                    cv2.rectangle(frame, (20, 56), (W - 20, 68), (40, 40, 40), 1)
                    cv2.putText(
                        frame,
                        "Eye closure",
                        (22, 66),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.32,
                        (0, 0, 0),
                        1,
                    )

            else:
                self.state = "NO FACE"
                self.eye_closed_frames = 0
                self.yawn_frames = 0
                self.gaze_away_frames = 0
                cv2.putText(
                    frame,
                    "No face detected — position camera",
                    (W // 2 - 180, H // 2),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (100, 100, 100),
                    1,
                )

            # ── HUD ────────────────────────────────────────────────────────
            self.hud.draw_top_bar(
                frame,
                W,
                self.state,
                ear,
                mar,
                self.alert.alert_count,
                self.alert.session_duration(),
                getattr(self, "perclos", 0.0),
                getattr(self, "blink_rate", 0),
            )
            self.hud.draw_bottom_bar(frame, W, H)

            if self.show_stats:
                self.hud.draw_stats(frame, W, H, self.ear_history, self.mar_history)

            # ── FPS ────────────────────────────────────────────────────────
            self.fps_counter += 1
            if time.time() - self.fps_timer >= 1.0:
                self.fps = self.fps_counter
                self.fps_counter = 0
                self.fps_timer = time.time()
            cv2.putText(
                frame,
                f"{self.fps:.0f}fps",
                (W - 60, H - 36),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.38,
                (50, 50, 50),
                1,
            )

            # ── Emergency system update + overlay ─────────────────────────
            emerg_phase = self.emergency.update()
            if self.emergency.active:
                self.emergency.draw(frame, W, H)

            cv2.imshow("Driver Drowsiness Detection", frame)

            # ── Keys ───────────────────────────────────────────────────────
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("r"):
                self.alert.reset()
                self.eye_closed_frames = 0
                self.yawn_frames = 0
            elif key == ord("s"):
                self.show_stats = not self.show_stats
            elif key == ord("c"):
                if self.emergency.cancel():
                    self.eye_closed_frames = 0
                    self.state = "ACTIVE"

        cap.release()
        self.landmarker.close()
        cv2.destroyAllWindows()

        # ── Session summary ────────────────────────────────────────────────
        print("\n" + "=" * 40)
        print("  SESSION SUMMARY")
        print("=" * 40)
        print(f"  Duration   : {self.alert.session_duration()}")
        print(f"  Alerts     : {self.alert.alert_count}")
        print(f"  PERCLOS    : {getattr(self, 'perclos', 0):.1%}")
        print(f"  Blink rate : {getattr(self, 'blink_rate', 0):.0f} blinks/min")
        score = SessionReport._safety_score(
            self.alert.alert_count,
            getattr(self, "perclos", 0),
            getattr(self, "blink_rate", 0),
        )
        print(f"  Safety score : {score}/100 — {SessionReport._rating(score)}")
        print("=" * 40 + "\n")

        # ── Generate session report ─────────────────────────────────────────
        rpath = self.report.save(self)
        print(f"[Report] Saved to: {rpath}")

        # ── Final phone notification ────────────────────────────────────────
        if self.alert.alert_count > 0:
            self.phone.send(
                "Drive Complete — Drowsiness Report",
                f"Duration: {self.alert.session_duration()}\n"
                f"Alerts: {self.alert.alert_count}\n"
                f"Safety Score: {score}/100 — {SessionReport._rating(score)}",
            )


# ──────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    detector = DrowsinessDetector()
    detector.run()
