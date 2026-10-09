# Heatlap

A social network for race fans and racers. Post photos, videos and updates, follow people, message friends,
run sponsorship spots, and go live. Built with Expo (React Native) and Supabase, with LiveKit for live video.

Everyone is a member. Anyone can switch on **"I race"** to show racer details (car number, class, season
stats), and anyone can list sponsorship spots. Circuits and clubs can register as **track** accounts.

## What's in the app

| Area | What it does |
|---|---|
| Home | Full-screen post feed, **Following** and **For you** |
| Friends | Search people, friends (mutual follows), followers, discover, and who is **live now** |
| Create (+) | Post text, a photo, a video or a gallery, or **Go live** |
| Inbox | Direct messages (with message requests), and activity: follows, likes, comments, bids, live alerts |
| Profile | Your page with a wallet menu and dashboard, sponsorship spots, saved posts, edit profile |
| Live | Host room (camera, chat, earnings) and viewer screen (watch, chat) |

Gifting is built in the database but **paused** until the viewer side of live ships.

## Stack

- [Expo](https://expo.dev) SDK 57, React Native 0.86, new architecture
- [Expo Router](https://docs.expo.dev/router/introduction/) (file-based routes, typed routes, protected routes)
- [NativeWind](https://www.nativewind.dev/) v4 (Tailwind classes), TypeScript
- [Supabase](https://supabase.com): Postgres + row-level security, auth, storage, realtime, edge functions
- [LiveKit](https://livekit.io): live video (`livekit-client`, `@livekit/react-native`)
- [TanStack Query](https://tanstack.com/query) for data fetching and caching

## Getting started

```bash
npm install
cp .env.example .env     # then fill in the two values (see Environment)
npx expo start           # press w for the browser, or scan the QR code with Expo Go
```

Useful scripts: `npm run typecheck`, `npm run lint`, `npm run doctor`, `npm run dev-client`, `npm run build:dev`.

### Environment

Only public values go in `.env` (anything prefixed `EXPO_PUBLIC_` is bundled into the app):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

**Never put secrets here.** The LiveKit key and secret, the Supabase service-role key and Stripe keys belong in
Supabase secrets only (`supabase secrets set ...`), used by edge functions.

### Expo Go, browser and development builds

- **Browser** (`npx expo start --web`): everything works, including live video. The camera needs
  `https://` or `http://localhost`, not a network address like `http://192.168.x.x`.
- **Expo Go**: everything works except sending or receiving **live video**. LiveKit needs native code that
  Expo Go doesn't include. The app tells you when you reach that point.
- **Development build** (needed once, for live video on a phone). Easiest, with nothing to install on your PC,
  is to build it in Expo's cloud with EAS:
  ```bash
  npx eas-cli login                  # free Expo account
  npm run build:dev                  # = eas build --profile development --platform android
  ```
  When it finishes, open the link or scan the QR code on your phone to install the app, then run
  `npm run dev-client` and open Heatlap on the phone. You only rebuild when native things change
  (new native package, permissions, app name, bundle id); normal code changes reload instantly.

  Prefer building on your own PC? Install Android Studio (it includes the SDK and Java), set `ANDROID_HOME` to the
  SDK folder, add its `platform-tools` folder to `PATH`, enable USB debugging on the phone and run
  `npx expo run:android`. After changing `app.json` run `npx expo prebuild --clean` first, because the
  generated `android/` folder is not updated automatically.

## Project layout

```
app/                 screens (Expo Router). (tabs)/ is the tab bar; auth/, post/, chat/, livestream/, user/ ...
components/          UI by area: post, profile, inbox, people, livestream, auth, ui
contexts/            AuthContext (session + the signed-in user's profile)
lib/api/             data access (posts, profiles, comments, messages, people, live)
lib/hooks/           usePostActions, useUnread, useLiveChat
lib/livekit/         connection, token request, native/web split
supabase/            edge functions (livekit-token, livekit-webhook) and this folder's CLI link
```

Database migrations and the schema documents live next to the web app in
`../onlyracefansaug1/supabase/` (`migrations/`, `SCHEMA.md`, `schema.sql`). Apply migrations in file-name order.

## Backend setup (once)

1. Apply the migrations in `../onlyracefansaug1/supabase/migrations/` (SQL Editor or `supabase db push`).
2. Set the LiveKit secrets and deploy the two functions from this folder:
   ```bash
   npx supabase login
   npx supabase secrets set LIVEKIT_URL=wss://<your-project>.livekit.cloud LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
   npx supabase functions deploy livekit-token
   npx supabase functions deploy livekit-webhook --no-verify-jwt
   ```
3. In LiveKit Cloud, add the webhook `https://<project-ref>.supabase.co/functions/v1/livekit-webhook`.
4. In Supabase Auth settings, allow the redirect URL `racerpro://auth/callback` (Google sign-in).

## App identity

| | |
|---|---|
| Name | Heatlap |
| Slug / scheme | `racerpro` / `racerpro://` |
| iOS bundle id / Android package | `com.racerpro.app` |

Change the bundle id and package **before the first store submission**; they can't be changed afterwards.
