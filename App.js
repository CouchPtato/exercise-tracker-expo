import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { Camera, useCameraPermissions } from "expo-camera"; // ✅ fixed import
import { Video } from "expo-av";
import axios from "axios";

export default function App() {
  const [data, setData] = useState({});
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [videoUri, setVideoUri] = useState(null);
  const [imageUri, setImageUri] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const backend = "http://192.168.x.x:8000"; // ✅ your backend IP

  // Start a new exercise session
  const startExercise = async (exerciseName) => {
    try {
      setSelectedExercise(exerciseName);
      const res = await axios.post(`${backend}/start_session`, {
        exercise: exerciseName,
        user_id: "1",
      });
      console.log("Session started:", res.data);
      setIsTracking(true);
      Alert.alert("✅ Session Started", `Tracking ${exerciseName}`);
    } catch (err) {
      console.error("Start session error:", err.message);
      Alert.alert("❌ Error", "Could not start exercise session.");
    }
  };

  // Stop exercise session
  const stopExercise = async () => {
    try {
      await axios.post(`${backend}/stop_session`);
      setSelectedExercise(null);
      setIsTracking(false);
      setData({});
      setVideoUri(null);
      setImageUri(null);
      setIsProcessing(false);
      Alert.alert("🛑 Session Stopped", "Exercise tracking stopped.");
    } catch (err) {
      console.error("Stop error:", err.message);
    }
  };

  // Upload a video and analyze it
  const uploadVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setVideoUri(uri);
        setIsProcessing(true);

        const formData = new FormData();
        formData.append("file", {
          uri,
          name: "exercise_video.mp4",
          type: "video/mp4",
        });

        const res = await axios.post(`${backend}/analyze_frame`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        setData(res.data);
        setIsProcessing(false);
        Alert.alert("📹 Video Uploaded", "Analysis complete!");
      }
    } catch (err) {
      console.error("Upload error:", err.message);
      setIsProcessing(false);
      Alert.alert("❌ Error", "Failed to upload video.");
    }
  };

  // Capture a live frame
  const captureFrame = async () => {
    try {
      // ✅ Check camera permissions
      if (!permission || !permission.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert("Permission required", "Camera permission is needed to capture frames.");
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        setIsProcessing(true);

        const formData = new FormData();
        formData.append("file", {
          uri,
          name: "frame.jpg",
          type: "image/jpeg",
        });

        const res = await axios.post(`${backend}/analyze_frame`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        setData(res.data);
        setIsProcessing(false);
      }
    } catch (err) {
      console.error("Camera error:", err.message);
      setIsProcessing(false);
    }
  };

  // Poll backend live data every second
  useEffect(() => {
    let interval;
    if (isTracking && selectedExercise) {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${backend}/data`);
          setData(res.data);
        } catch (error) {
          console.log("Error fetching data:", error.message);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking, selectedExercise]);

  // ✅ Draw skeleton overlay
  const renderSkeleton = () => {
    if (!data.keypoints) return null;
    const width = 320,
      height = 240;

    const getCoord = (x, y) => ({
      cx: x * width,
      cy: y * height,
    });

    const points = {};
    data.keypoints.forEach((kp) => {
      points[kp.name] = getCoord(kp.x, kp.y);
    });

    return (
      <Svg height={height} width={width} style={styles.skeletonOverlay}>
        {/* Example limbs */}
        {points.shoulder && points.elbow && (
          <Line
            x1={points.shoulder.cx}
            y1={points.shoulder.cy}
            x2={points.elbow.cx}
            y2={points.elbow.cy}
            stroke="blue"
            strokeWidth="3"
          />
        )}
        {points.elbow && points.wrist && (
          <Line
            x1={points.elbow.cx}
            y1={points.elbow.cy}
            x2={points.wrist.cx}
            y2={points.wrist.cy}
            stroke="blue"
            strokeWidth="3"
          />
        )}
        {Object.values(points).map((p, i) => (
          <Circle key={i} cx={p.cx} cy={p.cy} r="4" fill="red" />
        ))}
      </Svg>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏋️ Physiotherapy Exercise Tracker</Text>

      {!isTracking && (
        <View style={styles.buttonGroup}>
          {["bicep_curl", "squat", "shoulder_abduction", "knee_extension", "leg_raise", "side_bend"].map((name) => (
            <TouchableOpacity key={name} style={styles.button} onPress={() => startExercise(name)}>
              <Text style={styles.buttonText}>{name.replace("_", " ")}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isTracking && (
        <View style={styles.dataBox}>
          <Text style={styles.info}>Exercise: {selectedExercise}</Text>
          <Text style={styles.info}>Angle: {data.angle?.toFixed?.(2) || "—"}</Text>
          <Text style={styles.info}>Count: {data.count || "—"}</Text>
          <Text style={styles.info}>Stage: {data.stage || "—"}</Text>
          <Text style={styles.info}>Form: {data.form || "—"}</Text>

          <View style={styles.videoContainer}>
            {/* ✅ Uploaded Video */}
            {videoUri && (
              <Video
                source={{ uri: videoUri }}
                rate={1.0}
                volume={1.0}
                isMuted={false}
                resizeMode="contain"
                shouldPlay
                useNativeControls
                style={styles.videoPreview}
              />
            )}

            {/* ✅ Captured Image */}
            {imageUri && <Image source={{ uri: imageUri }} style={styles.videoPreview} />}

            {/* ✅ Skeleton Overlay */}
            {renderSkeleton()}
          </View>

          {isProcessing && <Text style={styles.processing}>⏳ Processing...</Text>}

          <TouchableOpacity style={styles.uploadBtn} onPress={uploadVideo}>
            <Text style={styles.uploadText}>Upload Video 🎥</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureBtn} onPress={captureFrame}>
            <Text style={styles.captureText}>Capture Frame 📸</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.stopBtn} onPress={stopExercise}>
            <Text style={styles.stopText}>Stop Session 🛑</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2f2f2", alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 20, textAlign: "center" },
  buttonGroup: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  button: { backgroundColor: "#4CAF50", margin: 5, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 10 },
  buttonText: { color: "#fff", fontWeight: "600", textTransform: "capitalize" },
  dataBox: { width: "100%", backgroundColor: "#fff", padding: 15, borderRadius: 10, elevation: 3, alignItems: "center" },
  info: { fontSize: 16, marginVertical: 4 },
  videoContainer: { position: "relative", marginVertical: 20 },
  videoPreview: { width: 320, height: 240, borderRadius: 10, backgroundColor: "#000" },
  skeletonOverlay: { position: "absolute", top: 0, left: 0 },
  uploadBtn: { backgroundColor: "#2196F3", padding: 10, borderRadius: 10, marginVertical: 5 },
  uploadText: { color: "#fff", fontWeight: "600" },
  captureBtn: { backgroundColor: "#FF9800", padding: 10, borderRadius: 10, marginVertical: 5 },
  captureText: { color: "#fff", fontWeight: "600" },
  stopBtn: { backgroundColor: "#FF4444", padding: 10, borderRadius: 10, marginVertical: 10 },
  stopText: { color: "#fff", fontWeight: "600" },
  processing: { marginVertical: 10, fontStyle: "italic", color: "gray" },
});
