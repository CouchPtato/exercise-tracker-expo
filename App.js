import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isTracking, setIsTracking] = useState(false);
  const [data, setData] = useState({ angle: 0, stage: "-", counter: 0, form: "-" });
  const cameraRef = useRef(null);
  const ws = useRef(null);
  const timer = useRef(null);

  // ⚠️ Replace with your machine's IP
  const SERVER_URL = "ws://192.168.1.7:8000/ws/track";

  // Ask for permission
  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
    return () => stopTracking(); // cleanup
  }, [permission]);

  // Start sending frames
  const startTracking = async () => {
    if (!cameraRef.current) return;
    ws.current = new WebSocket(SERVER_URL);

    ws.current.onopen = () => {
      console.log("✅ Connected to backend");
      setIsTracking(true);
      timer.current = setInterval(sendFrame, 400);
    };

    ws.current.onmessage = (msg) => {
      try {
        const res = JSON.parse(msg.data);
        setData(res);
      } catch {
        console.warn("Invalid message from backend");
      }
    };

    ws.current.onerror = (err) => console.error("WebSocket error:", err.message);
    ws.current.onclose = stopTracking;
  };

  const sendFrame = async () => {
    if (!cameraRef.current || !ws.current || ws.current.readyState !== 1) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ skipProcessing: true });
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 256 } }],
        { compress: 0.3, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      ws.current.send(JSON.stringify({ frame: "data:image/jpeg;base64," + resized.base64 }));
    } catch (err) {
      console.error("Error sending frame:", err);
    }
  };

  const stopTracking = () => {
    if (timer.current) clearInterval(timer.current);
    if (ws.current && ws.current.readyState === 1)
      ws.current.send(JSON.stringify({ type: "END" }));
    ws.current?.close();
    setIsTracking(false);
  };

  if (!permission)
    return (
      <View style={styles.center}>
        <Text>Requesting camera permission...</Text>
      </View>
    );

  if (!permission.granted)
    return (
      <View style={styles.center}>
        <Text>No access to camera</Text>
        <TouchableOpacity onPress={requestPermission}>
          <Text style={{ color: "blue" }}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      <View style={styles.overlay}>
        <Text style={styles.text}>Reps: {data.counter}</Text>
        <Text style={styles.text}>Angle: {data.angle}</Text>
        <Text style={styles.text}>Stage: {data.stage}</Text>
        <Text style={[styles.text, { color: data.form === "good" ? "lime" : "red" }]}>
          Form: {data.form}
        </Text>

        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: isTracking ? "#ff5555" : "#55ff55" },
          ]}
          onPress={isTracking ? stopTracking : startTracking}
        >
          <Text style={styles.btnText}>{isTracking ? "STOP" : "START"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  overlay: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  text: { fontSize: 18, color: "#fff", marginVertical: 4 },
  button: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 20,
  },
  btnText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
