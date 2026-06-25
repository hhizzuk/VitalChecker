"""
rPPG Starter — Phase 1, Tasks 1-2
Face detection + forehead ROI extraction using MediaPipe Face Mesh

Install deps:
    pip install opencv-python mediapipe numpy

Run:
    python rppg_starter.py
    python rppg_starter.py --source path/to/video.mp4
"""

import argparse
import cv2
import mediapipe as mp
import numpy as np
from collections import deque

# ── MediaPipe setup ────────────────────────────────────────────────────────────
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils

# Forehead landmark indices (MediaPipe 468-point mesh)
# These cluster around the center of the forehead — most signal-rich for rPPG
FOREHEAD_LANDMARKS = [10, 67, 69, 104, 108, 109, 151, 297, 299, 337, 338]


def get_forehead_roi(landmarks, frame_h, frame_w):
    """
    Extract forehead ROI bounding box from face mesh landmarks.
    Returns (x, y, w, h) or None if landmarks are missing.
    """
    points = []
    for idx in FOREHEAD_LANDMARKS:
        lm = landmarks[idx]
        x = int(lm.x * frame_w)
        y = int(lm.y * frame_h)
        points.append((x, y))

    if not points:
        return None

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]

    # Expand bounding box slightly for better coverage
    pad_x, pad_y = 20, 10
    x1 = max(0, min(xs) - pad_x)
    y1 = max(0, min(ys) - pad_y)
    x2 = min(frame_w, max(xs) + pad_x)
    y2 = min(frame_h, max(ys) + pad_y)

    return (x1, y1, x2 - x1, y2 - y1)


def extract_roi_mean_rgb(frame, roi):
    """
    Given a frame and ROI (x, y, w, h), return mean (R, G, B) of the region.
    Green channel carries the strongest pulse signal.
    """
    x, y, w, h = roi
    region = frame[y:y+h, x:x+w]
    if region.size == 0:
        return None
    # OpenCV uses BGR, convert to RGB
    mean_bgr = cv2.mean(region)[:3]
    return (mean_bgr[2], mean_bgr[1], mean_bgr[0])  # R, G, B


def main(source=0):
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"Error: could not open source '{source}'")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    print(f"Source FPS: {fps:.1f}")

    # Rolling buffer — stores (R, G, B) per frame for signal processing later
    buffer_size = int(fps * 10)  # 10 seconds of data
    rgb_buffer = deque(maxlen=buffer_size)

    with mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as face_mesh:

        print("Running — press Q to quit")

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            h, w = frame.shape[:2]
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(rgb_frame)

            if results.multi_face_landmarks:
                landmarks = results.multi_face_landmarks[0].landmark
                roi = get_forehead_roi(landmarks, h, w)

                if roi:
                    mean_rgb = extract_roi_mean_rgb(frame, roi)
                    if mean_rgb:
                        rgb_buffer.append(mean_rgb)

                    # ── Visualize ──────────────────────────────────────────
                    x, y, rw, rh = roi
                    cv2.rectangle(frame, (x, y), (x+rw, y+rh), (0, 255, 100), 2)
                    cv2.putText(
                        frame,
                        f"ROI  R:{mean_rgb[0]:.0f}  G:{mean_rgb[1]:.0f}  B:{mean_rgb[2]:.0f}",
                        (x, y - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 100), 1
                    )

                # Draw sparse face mesh for reference
                mp_drawing.draw_landmarks(
                    frame,
                    results.multi_face_landmarks[0],
                    mp_face_mesh.FACEMESH_CONTOURS,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing.DrawingSpec(
                        color=(80, 80, 80), thickness=1, circle_radius=1
                    ),
                )

            else:
                cv2.putText(frame, "No face detected", (20, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

            # Buffer status
            cv2.putText(
                frame,
                f"Buffer: {len(rgb_buffer)}/{buffer_size} frames",
                (10, h - 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1
            )

            cv2.imshow("rPPG — ROI Detection", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()

    # Print sample of collected signal — next step is bandpass + FFT on this
    if rgb_buffer:
        arr = np.array(rgb_buffer)
        print(f"\nCollected {len(arr)} frames of RGB data")
        print(f"Green channel  mean={arr[:,1].mean():.2f}  std={arr[:,1].std():.2f}")
        print("Next step: bandpass filter + FFT → heart rate estimate")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=0,
                        help="Camera index (default 0) or path to video file")
    args = parser.parse_args()

    # Convert to int if it's a digit string (e.g. "0")
    source = int(args.source) if str(args.source).isdigit() else args.source
    main(source)