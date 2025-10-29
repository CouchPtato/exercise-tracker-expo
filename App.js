import React, { useState, useEffect } from "react";
import { View, Button, Text } from "react-native";
import axios from "axios";

export default function App() {
  const [data, setData] = useState({});
  const [selectedExercise, setSelectedExercise] = useState(null);
  const backend = "http://192.168.x.x:8000";

  const startExercise = async (name) => {
    setSelectedExercise(name);
    await axios.post(`${backend}/start_exercise?name=${name}`);
  };

  const stopExercise = async () => {
    await axios.post(`${backend}/stop`);
    setSelectedExercise(null);
  };

  useEffect(() => {
    let interval;
    if (selectedExercise) {
      interval = setInterval(async () => {
        const res = await axios.get(`${backend}/data`);
        setData(res.data);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [selectedExercise]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Physiotherapy Exercise Tracker</Text>

      {["bicep_curl", "squat", "shoulder_abduction", "knee_extension", "leg_raise", "side_bend"].map((name) => (
        <Button key={name} title={`Start ${name}`} onPress={() => startExercise(name)} />
      ))}

      {selectedExercise && (
        <>
          <Text>Exercise: {selectedExercise}</Text>
          <Text>Angle: {data.angle}</Text>
          <Text>Count: {data.count}</Text>
          <Text>Stage: {data.stage}</Text>
          <Text>Form: {data.form}</Text>
          <Button title="Stop" onPress={stopExercise} />
        </>
      )}
    </View>
  );
}
