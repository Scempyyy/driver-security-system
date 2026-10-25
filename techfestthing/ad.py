# controls (simple)
# index finger up = draw
# index + middle = stop drawing
# E = eraser
# C = clear
# Q = quit

import cv2
import numpy as np
import time
import urllib.request
import os
import sys

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.vision import (
    HandLandmarker,
    HandLandmarkerOptions,
    RunningMode,
)

# CONFIG (just basic stuff)
MODEL_PATH = "hand_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

BRUSH_SIZE = 6
ERASER_SIZE = 40

COLORS = {
    "Yellow": (0, 200, 255),
    "Red": (50, 50, 255),
    "Green": (50, 220, 50),
    "White": (255, 255, 255),
    "Blue": (248, 100, 50),
    "Kala": (50,50,50),
}

DEFAULT_COLOR = (0, 200, 255)

TIPS = [4, 8, 12, 16, 20]
PIPS = [3, 6, 10, 14, 18]


# download model if not already there
def ensure_model():
    if os.path.exists(MODEL_PATH):
        print("model already exists 👍")
        return

    print("downloading model... (first time only)")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("done downloading")
    except Exception as e:
        print("error downloading model:", e)
        print("download manually if needed")
        sys.exit(1)


# check which fingers are up
def fingers_up(landmarks, handedness="Right"):
    up = []

    # thumb logic (confusing but works)
    if handedness == "Right":
        up.append(landmarks[TIPS[0]].x < landmarks[PIPS[0]].x)
    else:
        up.append(landmarks[TIPS[0]].x > landmarks[PIPS[0]].x)

    # other fingers
    for tip, pip in zip(TIPS[1:], PIPS[1:]):
        up.append(landmarks[tip].y < landmarks[pip].y)

    return up


def lm_to_px(landmark, w, h):
    return int(landmark.x * w), int(landmark.y * h)


# top toolbar (colors + eraser + clear)
def draw_toolbar(frame, W, active_color, eraser_on):
    bar_h = 70
    cv2.rectangle(frame, (0, 0), (W, bar_h), (25, 25, 25), -1)

    x = 15
    for name, clr in COLORS.items():
        cv2.rectangle(frame, (x, 8), (x + 52, 62), clr, -1)

        # highlight selected color
        if clr == active_color and not eraser_on:
            cv2.rectangle(frame, (x - 3, 5), (x + 55, 65), (255, 255, 255), 3)

        cv2.putText(frame, name, (x, 76), cv2.FONT_HERSHEY_SIMPLEX, 0.37, clr, 1)
        x += 68

    # eraser box
    eraser_x = x + 8
    ecol = (210, 210, 210) if eraser_on else (75, 75, 75)
    cv2.rectangle(frame, (eraser_x, 8), (eraser_x + 85, 62), ecol, -1)
    cv2.putText(frame, "ERASER", (eraser_x + 5, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

    # clear box
    clear_x = eraser_x + 100
    cv2.rectangle(frame, (clear_x, 8), (clear_x + 80, 62), (0, 55, 170), -1)
    cv2.putText(frame, "CLEAR", (clear_x + 8, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    return bar_h, eraser_x, clear_x


# check if finger clicked toolbar
def toolbar_hit(tx, ty, bar_h, eraser_x, clear_x, color, eraser_on):
    if ty > bar_h:
        return color, eraser_on, False

    x = 15
    for clr in COLORS.values():
        if x <= tx <= x + 52:
            return clr, False, False
        x += 68

    if eraser_x <= tx <= eraser_x + 85:
        return color, True, False

    if clear_x <= tx <= clear_x + 80:
        return color, eraser_on, True

    return color, eraser_on, False


# just drawing hand lines (not important but looks cool)
def draw_hand_skeleton(frame, hand_lms, W, H):
    connections = vision.HandLandmarksConnections.HAND_CONNECTIONS

    for conn in connections:
        s = hand_lms[conn.start]
        e = hand_lms[conn.end]
        cv2.line(frame, lm_to_px(s, W, H), lm_to_px(e, W, H), (80, 200, 80), 2)

    for lm in hand_lms:
        px, py = lm_to_px(lm, W, H)
        cv2.circle(frame, (px, py), 4, (255, 255, 255), -1)


# main function
def main():
    ensure_model()

    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = HandLandmarkerOptions(
        base_options=base_options,
        running_mode=RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.6,
        min_hand_presence_confidence=0.6,
        min_tracking_confidence=0.5,
    )

    landmarker = HandLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print("camera started:", W, "x", H)

    canvas = np.zeros((H, W, 3), dtype=np.uint8)

    prev_pt = None
    color = DEFAULT_COLOR
    eraser_on = False

    last_click_time = 0
    CLICK_COOL = 0.6  # just to avoid spam clicking

    print("air canvas running... press Q to exit")

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        frame = cv2.flip(frame, 1)

        timestamp_ms = int(cap.get(cv2.CAP_PROP_POS_MSEC))

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        result = landmarker.detect_for_video(mp_image, timestamp_ms)

        bar_h, eraser_x, clear_x = draw_toolbar(frame, W, color, eraser_on)

        if result.hand_landmarks:
            hand_lms = result.hand_landmarks[0]

            draw_hand_skeleton(frame, hand_lms, W, H)

            up = fingers_up(hand_lms)
            ix, iy = lm_to_px(hand_lms[8], W, H)

            now = time.time()

            # clicking toolbar
            if iy < bar_h and now - last_click_time > CLICK_COOL:
                color, eraser_on, do_clear = toolbar_hit(
                    ix, iy, bar_h, eraser_x, clear_x, color, eraser_on
                )

                if do_clear:
                    canvas[:] = 0

                last_click_time = now
                prev_pt = None

            else:
                # drawing mode
                if up[1] and not up[2]:
                    if prev_pt:
                        if eraser_on:
                            cv2.circle(canvas, (ix, iy), ERASER_SIZE, (0, 0, 0), -1)
                        else:
                            cv2.line(canvas, prev_pt, (ix, iy), color, BRUSH_SIZE)
                    prev_pt = (ix, iy)

                # hover mode
                elif up[1] and up[2]:
                    prev_pt = None
                else:
                    prev_pt = None

            # pointer circle
            cur_col = (150, 150, 150) if eraser_on else color
            cur_size = ERASER_SIZE if eraser_on else BRUSH_SIZE + 6
            cv2.circle(frame, (ix, iy), cur_size, cur_col, 2)

        else:
            prev_pt = None

        # merge canvas
        gray = cv2.cvtColor(canvas, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
        frame[mask > 0] = canvas[mask > 0]

        cv2.imshow("Air Canvas", frame)

        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            break
        elif key == ord("e"):
            eraser_on = not eraser_on
        elif key == ord("c"):
            canvas[:] = 0

    cap.release()
    landmarker.close()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()