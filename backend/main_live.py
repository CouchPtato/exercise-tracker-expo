
from fastapi import FastAPI, WebSocket
import cv2, base64, numpy as np, json
import mediapipe as mp

app = FastAPI(title="Live Exercise Tracker")

mp_pose = mp.solutions.pose
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

def calc_angle(a, b, c):
    a, b, c = np.array(a), np.array(b), np.array(c)
    angle = np.degrees(
        np.arctan2(c[1] - b[1], c[0] - b[0])
        - np.arctan2(a[1] - b[1], a[0] - b[0])
    )
    angle = abs(angle)
    if angle > 180:
        angle = 360 - angle
    return angle

@app.websocket("/ws/track")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    counter = 0
    stage = None

    while True:
        try:
            data = await ws.receive_text()
            frame_data = json.loads(data)
            if frame_data.get("type") == "END":
                break

            img_b64 = frame_data["frame"]
            frame_bytes = base64.b64decode(img_b64.split(",")[-1])
            npimg = np.frombuffer(frame_bytes, np.uint8)
            frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

            results = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            if not results.pose_landmarks:
                continue

            lm = results.pose_landmarks.landmark
            get_xy = lambda id: [lm[id].x, lm[id].y]

            shoulder = get_xy(mp_pose.PoseLandmark.RIGHT_SHOULDER.value)
            elbow = get_xy(mp_pose.PoseLandmark.RIGHT_ELBOW.value)
            wrist = get_xy(mp_pose.PoseLandmark.RIGHT_WRIST.value)
            angle = calc_angle(shoulder, elbow, wrist)

            form = "good"
            if angle > 160:
                stage = "down"
            if angle < 50 and stage == "down":
                stage = "up"
                counter += 1
            if angle < 30 or angle > 170:
                form = "bad"

            msg = {
                "angle": round(angle, 1),
                "stage": stage,
                "counter": counter,
                "form": form
            }
            await ws.send_text(json.dumps(msg))

        except Exception as e:
            print("WebSocket error:", e)
            break

    await ws.close()
