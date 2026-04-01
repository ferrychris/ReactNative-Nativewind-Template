# Expo + NativeWind Starter Template

A minimal, ready-to-use starter template for building React Native apps with [Expo Router](https://expo.github.io/router) and [NativeWind](https://www.nativewind.dev/) (Tailwind CSS for React Native).

## Stack

- [Expo](https://expo.dev) ~54 with New Architecture enabled
- [Expo Router](https://expo.github.io/router) ~6 — file-based routing
- [NativeWind](https://www.nativewind.dev/) v4 — Tailwind CSS utility classes in React Native
- [React Native](https://reactnative.dev) 0.81
- [TypeScript](https://www.typescriptlang.org/) ~5.9
- React Compiler + Typed Routes enabled

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Expo CLI](https://docs.expo.dev/more/expo-cli/): `npm install -g expo-cli`
- For iOS: Xcode (macOS only)
- For Android: Android Studio + emulator, or a physical device with [Expo Go](https://expo.dev/go)

## Getting Started

1. **Clone the repo**

   ```bash
   git clone https://github.com/<your-username>/<your-repo-name>.git
   cd <your-repo-name>
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the dev server**

   ```bash
   npx expo start
   ```

   Then press:
   - `a` — open Android emulator
   - `i` — open iOS simulator
   - `w` — open in browser
   - Scan the QR code with [Expo Go](https://expo.dev/go) on your device

## Project Structure

```
app/                  # File-based routes (Expo Router)
  index.tsx           # Entry screen
assets/               # Images, fonts, icons
components/           # Shared components
global.css            # Tailwind base styles (imported once)
tailwind.config.js    # Tailwind / NativeWind config
babel.config.js       # Babel config with NativeWind preset
metro.config.js       # Metro config with NativeWind
```

## Using Tailwind Classes

NativeWind lets you use Tailwind utility classes directly on React Native components via the `className` prop:

```tsx
import { View, Text } from "react-native";

export default function MyComponent() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-xl font-bold text-blue-500">Hello world</Text>
    </View>
  );
}
```

> **Important:** When you add new files that use Tailwind classes, make sure the file path is covered by the `content` array in `tailwind.config.js`. By default it covers `app/**/*` and `components/**/*`.

## Adding a New Screen

Create a file inside `app/` and it becomes a route automatically:

```
app/about.tsx   →   /about
app/profile/index.tsx   →   /profile
```

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm run android` | Start on Android |
| `npm run ios` | Start on iOS |
| `npm run web` | Start on web |
| `npm run lint` | Run ESLint |
| `npm run reset-project` | Clear the app directory and start fresh |

## License

MIT
