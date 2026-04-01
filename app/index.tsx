import { Text, View, TouchableOpacity } from "react-native";
import "@/global.css";

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      
      <TouchableOpacity onPress={() => alert("Hello")} className="bg-blue-500 px-4 py-2 rounded">
        <Text className="text-30px text-white">Edit app/index.tsx to edit this screen.</Text>
      </TouchableOpacity>
    </View>
  );
}
