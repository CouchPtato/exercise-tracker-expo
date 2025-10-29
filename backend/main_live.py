from fastapi import FastAPI, Query
from fastapi.responses import StreamingResponse, JSONResponse
import cv2
import mediapipe as mp
import math
import threading
import io

app = FastAPI()

mp_pose = mp.solutions.pose
mp_draw = mp.solutions.drawing_utils
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

camera = cv2.VideoCapture(0)
lock = threading.Lock()

current_exercise = None
exercise_data = {"angle": 0, "count": 0, "stage": "", "form": "good"}
running = False

def calculate_angle(a, b, c):
    rads = math.atan2(c[1] - b[1], c[0] - b[0]) - math.atan2(a[1] - b[1], a[0] - b[0])
    angle = abs(rads * 180 / math.pi)
    if angle > 180:
        angle = 360 - angle
    return angle

def track_exercise():
    global running, current_exercise, exercise_data
    frame_count = 0

    while running:
        status, frame = camera.read()
        if not status:
            break

        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(image)
        image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

        if results.pose_landmarks:
            landmarks = results.pose_landmarks.landmark
            form = "good"
            angle = None
            counter = exercise_data["count"]
            stage = exercise_data["stage"]

            # Handle different exercises
            def get_point(idx): return [landmarks[idx].x, landmarks[idx].y]

            if current_exercise == "bicep_curl":
                shoulder, elbow, wrist = get_point(mp_pose.PoseLandmark.RIGHT_SHOULDER.value), \
                                         get_point(mp_pose.PoseLandmark.RIGHT_ELBOW.value), \
                                         get_point(mp_pose.PoseLandmark.RIGHT_WRIST.value)
                angle = calculate_angle(shoulder, elbow, wrist)
                if angle > 160: stage = "down"
                if angle < 50 and stage == "down":
                    stage = "up"; counter += 1
                if angle < 30 or angle > 170: form = "bad"

            elif current_exercise == "squat":
                hip, knee, ankle = get_point(mp_pose.PoseLandmark.RIGHT_HIP.value), \
                                   get_point(mp_pose.PoseLandmark.RIGHT_KNEE.value), \
                                   get_point(mp_pose.PoseLandmark.RIGHT_ANKLE.value)
                angle = calculate_angle(hip, knee, ankle)
                if angle > 160: stage = "up"
                if angle < 90 and stage == "up":
                    stage = "down"; counter += 1
                if angle < 70 or angle > 170: form = "bad"

            elif current_exercise == "shoulder_abduction":
                hip, shoulder, elbow = get_point(mp_pose.PoseLandmark.RIGHT_HIP.value), \
                                       get_point(mp_pose.PoseLandmark.RIGHT_SHOULDER.value), \
                                       get_point(mp_pose.PoseLandmark.RIGHT_ELBOW.value)
                angle = calculate_angle(hip, shoulder, elbow)
                if angle < 30: stage = "down"
                if angle > 80 and stage == "down":
                    stage = "up"; counter += 1
                if angle < 20 or angle > 120: form = "bad"

            # ✳️ Add 3 more physiotherapy exercises here
            # e.g., knee_extension, leg_raise, side_bend with their angle logic

            exercise_data = {
                "angle": round(angle, 2) if angle else 0,
                "count": counter,
                "stage": stage,
                "form": form
            }

        frame_count += 1

@app.post("/start_exercise")
def start_exercise(name: str = Query(...)):
    global running, current_exercise
    if running:
        return JSONResponse({"error": "Exercise already running"}, status_code=400)
    current_exercise = name
    running = True
    thread = threading.Thread(target=track_exercise)
    thread.start()
    return {"message": f"Started tracking {name}"}

@app.post("/stop")
def stop_exercise():
    global running, current_exercise
    running = False
    current_exercise = None
    return {"message": "Stopped tracking"}

@app.get("/data")
def get_data():
    """Frontend polls this endpoint every 1s for live updates"""
    return exercise_data
