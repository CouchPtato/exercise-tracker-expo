from fastapi import FastAPI, WebSocket
import cv2, base64, numpy as np, json, mediapipe as mp

app = FastAPI(title="Live Exercise Tracker")

# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

# ---------- Helper function ----------
def calc_angle(a, b, c):
    """Calculate angle between three points."""
    a, b, c = np.array(a), np.array(b), np.array(c)
    angle = np.degrees(
        np.arctan2(c[1] - b[1], c[0] - b[0])
        - np.arctan2(a[1] - b[1], a[0] - b[0])
    )
    angle = abs(angle)
    if angle > 180:
        angle = 360 - angle
    return angle


# ---------- WebSocket endpoint ----------
@app.websocket("/ws/track")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    print("✅ Client connected")

    counter, stage = 0, None

    try:
        while True:
            # Receive frame from client
            data = await ws.receive_text()
            frame_data = json.loads(data)

            # Stop if client sends END signal
            if frame_data.get("type") == "END":
                print("🛑 Session ended by client")
                break

            # Decode image from Base64
            img_b64 = frame_data.get("frame", "")
            if not img_b64:
                continue

            try:
                frame_bytes = base64.b64decode(img_b64.split(",")[-1])
                npimg = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
            except Exception as e:
                print("⚠️ Frame decode error:", e)
                continue

            # Run pose detection
            results = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

            # If no pose detected, send placeholder
            if not results.pose_landmarks:
                await ws.send_text(json.dumps({
                    "angle": 0,
                    "stage": "-",
                    "counter": counter,
                    "form": "no_pose"
                }))
                continue

            lm = results.pose_landmarks.landmark
            get_xy = lambda idx: [lm[idx].x, lm[idx].y]

            # Right arm landmarks
            shoulder = get_xy(mp_pose.PoseLandmark.RIGHT_SHOULDER.value)
            elbow = get_xy(mp_pose.PoseLandmark.RIGHT_ELBOW.value)
            wrist = get_xy(mp_pose.PoseLandmark.RIGHT_WRIST.value)

            # Calculate angle
            angle = calc_angle(shoulder, elbow, wrist)

            # Stage + Counter logic
            form = "good"
            if angle > 160:
                stage = "down"
            if angle < 50 and stage == "down":
                stage = "up"
                counter += 1
            if angle < 30 or angle > 170:
                form = "bad"

            # Prepare result
            msg = {
                "angle": round(angle, 1),
                "stage": stage or "-",
                "counter": counter,
                "form": form,
            }

            # Send live data back to frontend
            await ws.send_text(json.dumps(msg))
            print("📤 Sent:", msg)

    except Exception as e:
        print("❌ WebSocket error:", e)

    finally:
        await ws.close()
        print("🔒 WebSocket closed")
