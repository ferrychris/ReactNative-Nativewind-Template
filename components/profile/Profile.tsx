import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { blockUser, fetchLikedPosts, fetchPosts, fetchSavedPosts } from "@/lib/api/posts";
import { deleteRaceResult, fetchRaceResults, setCarPhoto } from "@/lib/api/results";
import { RaceLogo } from "@/components/RaceLogo";
import { useSwipe } from "@/lib/hooks/useSwipe";
import { ResultSheet } from "./ResultSheet";
import { uploadProfileImage } from "@/lib/api/profiles";
import { SponsorshipSection } from "@/components/sponsorship/SponsorshipSection";
import { useNewOfferCount } from "@/components/sponsorship/DealsPanel";
import { setFollow } from "@/lib/api/posts";
import { messageError, startChat } from "@/lib/api/messages";
import { compact, initialsOf, lapTime, usd } from "@/lib/format";
import type { FeedPost, ProfileView, RaceResultRow } from "@/lib/types";

type Tab = "posts" | "car" | "results" | "saved" | "liked" | "people";

const ORANGE = "#e8582f";
const TEXT = "#f2f0ee";
const MUTED = "#9a928d";

const comingSoon = (what: string) => Alert.alert("Coming soon", `${what} isn't available yet.`);

/* ---------- small pieces ---------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[2px] text-paddock-muted">{children}</Text>;
}

const LINK_RE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/\S+)/g;

/** Bio text where emails and links are orange and tappable. */
function BioText({ text }: { text: string }) {
  const parts = text.split(LINK_RE);
  return (
    <Text className="text-[15px] leading-[22px] text-paddock-text">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} onPress={() => Linking.openURL(part.includes("@") && !part.startsWith("http") ? `mailto:${part}` : part).catch(() => {})} className="text-paddock-orange">
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="mr-10">
      <Text className="text-[20px] font-bold text-paddock-text">{value}</Text>
      <Text className="mt-0.5 text-[12px] text-paddock-muted">{label}</Text>
    </View>
  );
}

function PostTile({ post }: { post: FeedPost }) {
  const router = useRouter();
  const first = post.media[0];
  const locked = post.visibility === "followers_only";
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } })}
      accessibilityLabel="Open post"
      className="w-1/3 p-[1px] active:opacity-80"
    >
      <View className="aspect-[3/4] justify-between bg-paddock-surface p-2">
        {first?.kind === "photo" ? (
          <Image source={{ uri: first.thumbnailUrl ?? first.url }} contentFit="cover" cachePolicy="memory-disk" transition={150} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.85 }} />
        ) : first?.kind === "video" ? (
          <View className="absolute inset-0 items-center justify-center">
            <Ionicons name="play-circle-outline" size={34} color="#6b7385" />
          </View>
        ) : (
          <Text numberOfLines={5} className="text-[12px] leading-[17px] text-paddock-peach">
            {post.content}
          </Text>
        )}
        <View className="flex-row items-start justify-between">
          {post.media.length > 1 ? <Ionicons name="copy-outline" size={14} color={TEXT} /> : <View />}
          {locked && <Ionicons name="lock-closed" size={14} color={TEXT} />}
        </View>
        <View className="flex-row items-center">
          <Ionicons name={first?.kind === "video" ? "play" : "heart-outline"} size={12} color={TEXT} />
          <Text className="ml-1 text-[12px] font-semibold text-paddock-text">{compact(first?.kind === "video" ? post.views : post.likes)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const GRID_STRIP: Record<"posts" | "saved" | "liked", { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  posts: { label: "Feed posts", icon: "grid-outline" },
  saved: { label: "Saved inventory", icon: "bookmark-outline" },
  liked: { label: "Liked posts", icon: "heart-outline" },
};

/** Orange strip above the post grid, matching the car tab's section headers. */
function GridStrip({ source, count }: { source: "posts" | "saved" | "liked"; count: number }) {
  const s = GRID_STRIP[source];
  return (
    <View className="mt-3 flex-row items-center justify-between border-b border-paddock-border px-4 pb-2">
      <View className="flex-row items-center">
        <Ionicons name={s.icon} size={13} color={ORANGE} />
        <Text className="ml-2 text-[11px] font-extrabold uppercase tracking-[1px] text-paddock-text">{s.label}</Text>
      </View>
      <Text className="text-[10px] font-bold uppercase text-paddock-orange">{count} Loaded</Text>
    </View>
  );
}

type GridSource = "posts" | "saved" | "liked";

// A tab opens with the newest few, then fills in gradually: small first page so something shows
// at once, then BACKGROUND_PAGES more pages quietly, then "Load more" for the rest.
const FIRST_PAGE = 6;
const NEXT_PAGE = 12;
const BACKGROUND_PAGES = 2;

/** One shape for the grid query, shared by the tab itself and the background prefetch. */
function gridQuery(source: GridSource, userId: string, viewerId: string) {
  return {
    queryKey: ["userPosts", userId, source],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }: { pageParam: string | null }) => {
      const limit = pageParam ? NEXT_PAGE : FIRST_PAGE;
      return source === "saved"
        ? fetchSavedPosts({ viewerId, cursor: pageParam, limit })
        : source === "liked"
          ? fetchLikedPosts({ viewerId, cursor: pageParam, limit })
          : fetchPosts({ viewerId, authorId: userId, cursor: pageParam, limit });
    },
    getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor,
    staleTime: 60_000,
  };
}

function PostsGrid({ userId, isMe, source = "posts" }: { userId: string; isMe: boolean; source?: GridSource }) {
  const { profile } = useAuth();
  const router = useRouter();
  const query = useInfiniteQuery(gridQuery(source, userId, profile!.id));
  const loadedPages = query.data?.pages.length ?? 0;
  useEffect(() => {
    if (loadedPages === 0 || loadedPages > BACKGROUND_PAGES || !query.hasNextPage || query.isFetchingNextPage) return;
    const t = setTimeout(() => query.fetchNextPage(), 350);
    return () => clearTimeout(t);
  }, [loadedPages, query.hasNextPage, query.isFetchingNextPage, query]);
  const posts = query.data?.pages.flatMap((p) => p.items) ?? [];

  if (query.isPending) return <ActivityIndicator color={ORANGE} className="mt-10" />;
  if (query.isError) {
    return (
      <Pressable onPress={() => query.refetch()} className="items-center py-10 active:opacity-70">
        <Text className="text-[14px] text-paddock-muted">Couldn't load posts. Tap to retry.</Text>
      </Pressable>
    );
  }
  if (posts.length === 0) {
    return (
      <View className="items-center px-10 py-14">
        <Text className="text-[14px] text-paddock-muted">
          {source === "saved" ? "Posts you save will show up here" : source === "liked" ? "Posts you like will show up here" : isMe ? "Your first post will show up here" : "No posts yet"}
        </Text>
        {isMe && source === "posts" && (
          <Pressable onPress={() => router.push("/post/create")} accessibilityRole="button" className="mt-4 border border-paddock-border px-6 py-3 active:opacity-70">
            <Text className="text-[14px] font-semibold text-paddock-text">Create post</Text>
          </Pressable>
        )}
      </View>
    );
  }
  return (
    <>
      <GridStrip source={source} count={posts.length} />
      <View className="mt-[1px] flex-row flex-wrap">
        {posts.map((p) => (
          <PostTile key={p.id} post={p} />
        ))}
      </View>
      {query.hasNextPage && (
        <Pressable onPress={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="items-center py-5 active:opacity-70">
          {query.isFetchingNextPage ? <ActivityIndicator color={ORANGE} /> : <Text className="text-[14px] font-semibold text-paddock-orange">Load more</Text>}
        </Pressable>
      )}
    </>
  );
}

function Avatar({ view, onEdit, busy, size = 88, square = false }: { view: ProfileView; onEdit?: () => void; busy?: boolean; size?: number; square?: boolean }) {
  return (
    <View>
      <View style={{ width: size, height: size, borderRadius: square ? size * 0.16 : size / 2 }} className="items-center justify-center overflow-hidden border border-paddock-border bg-paddock-surface">
        {view.avatarUrl ? (
          <Image source={{ uri: view.avatarUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
        ) : view.isRacer || view.userType === "track" ? (
          <Text style={{ fontSize: size * 0.32 }} className="font-semibold text-paddock-muted">
            {initialsOf(view.name)}
          </Text>
        ) : (
          <MaterialCommunityIcons name="racing-helmet" size={size * 0.42} color="#4a4a52" />
        )}
        {busy && (
          <View className="absolute inset-0 items-center justify-center bg-black/50">
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>
      {onEdit && (
        <Pressable
          onPress={onEdit}
          hitSlop={8}
          accessibilityLabel="Change profile photo"
          className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-paddock-bg bg-paddock-orange"
        >
          <Ionicons name="add" size={16} color="#ffffff" />
        </Pressable>
      )}
    </View>
  );
}

/* ---------- owner navbar + wallet dropdown ---------- */

function WalletRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View className="flex-row items-center border-t border-paddock-border py-3">
      <Ionicons name={icon} size={20} color={MUTED} />
      <Text className="ml-3 flex-1 text-[15px] text-paddock-text">{label}</Text>
      <Text className="text-[15px] font-semibold text-paddock-text">{value}</Text>
    </View>
  );
}

function WalletDropdown({ view, open, onClose, top }: { view: ProfileView; open: boolean; onClose: () => void; top: number }) {
  const w = view.wallet;
  const canCashOut = true; // anyone who earns can cash out
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-black/60">
        <Pressable onPress={(e) => e.stopPropagation()} style={{ top }} className="absolute left-4 right-4 border border-paddock-border bg-paddock-bg p-4">
          <Text className="text-[12px] font-semibold uppercase tracking-[2px] text-paddock-muted">Wallet balance</Text>
          <Text className="mb-4 mt-1 text-[34px] font-semibold text-paddock-text">{usd(w?.balanceCents ?? 0)}</Text>

          <View className="mb-3 flex-row gap-2">
            <Pressable onPress={() => comingSoon("Adding funds")} className="h-11 flex-1 items-center justify-center bg-paddock-orange active:opacity-80">
              <Text className="text-[15px] font-semibold text-paddock-text">Add funds</Text>
            </Pressable>
            {canCashOut && (
              <Pressable onPress={() => comingSoon("Cash out")} className="h-11 flex-1 items-center justify-center border border-paddock-border active:opacity-70">
                <Text className="text-[15px] font-semibold text-paddock-text">Cash out</Text>
              </Pressable>
            )}
          </View>

          {canCashOut && <WalletRow icon="trending-up-outline" label="Earned this month" value={usd(w?.earnedThisMonthCents ?? 0)} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const profileTitle = (view: ProfileView) => (view.isRacer ? "Racer profile" : view.userType === "track" ? "Track profile" : "Profile");

/** Brand strip across the top: app label on the left, screen title in the middle, actions on the right. */
function BrandBar({ title, left, right }: { title: string; left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View className="h-12 flex-row items-center justify-between border-b border-paddock-surface px-4">
      <View className="w-[96px] flex-row items-center">
        {left ?? (
          <>
            <RaceLogo size={20} />
            <Text className="ml-1.5 text-[10px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">Heatlap</Text>
          </>
        )}
      </View>
      <Text className="text-[15px] font-bold uppercase tracking-[2px] text-paddock-text">{title}</Text>
      <View className="w-[96px] flex-row items-center justify-end">{right}</View>
    </View>
  );
}

function OwnerNavbar({ view, onMenu }: { view: ProfileView; onMenu: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <BrandBar
        title={profileTitle(view)}
        right={
          <>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setOpen(true);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Wallet"
              className="mr-3 active:opacity-60"
            >
              <Ionicons name="options-outline" size={22} color={TEXT} />
            </Pressable>
            <Pressable onPress={() => router.push("/edit-profile")} hitSlop={8} accessibilityLabel="Edit profile" className="h-7 w-7 items-center justify-center rounded-md bg-paddock-orange active:opacity-80">
              <Ionicons name="person" size={15} color="#0b0b0d" />
            </Pressable>
          </>
        }
      />
      <View className="h-12 flex-row items-center justify-between px-4">
        <Pressable hitSlop={12} onPress={() => router.push("/edit-profile")} accessibilityLabel="Edit profile" className="active:opacity-60">
          <Ionicons name="pencil-outline" size={22} color={TEXT} />
        </Pressable>
        <View className="flex-row items-center">
          <Pressable
            hitSlop={10}
            onPress={() => {
              Haptics.selectionAsync();
              onMenu();
            }}
            accessibilityRole="button"
            accessibilityLabel="Menu"
            className="active:opacity-60"
          >
            <Ionicons name="reorder-three-outline" size={26} color={TEXT} />
          </Pressable>
        </View>
      </View>
      <WalletDropdown view={view} open={open} onClose={() => setOpen(false)} top={insets.top + 48} />
    </>
  );
}

function PublicNavbar({ view, onShare, following, onFollow }: { view: ProfileView; onShare: () => void; following: boolean; onFollow: () => void }) {
  const router = useRouter();
  const { profile } = useAuth();
  const more = () => {
    Haptics.selectionAsync();
    Alert.alert(`@${view.username}`, undefined, [
      {
        text: "Block",
        style: "destructive",
        onPress: () =>
          Alert.alert(`Block @${view.username}?`, "You won't see each other's posts or be able to message each other.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Block",
              style: "destructive",
              onPress: async () => {
                try {
                  if (profile) await blockUser(profile.id, view.id);
                  router.canGoBack() ? router.back() : router.replace("/dashboard");
                } catch {
                  Alert.alert("Couldn't block", "Check your connection and try again.");
                }
              },
            },
          ]),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };
  return (
    <BrandBar
      title={profileTitle(view)}
      left={
        <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/dashboard"))} accessibilityLabel="Back" className="active:opacity-60">
          <Ionicons name="arrow-back" size={24} color={TEXT} />
        </Pressable>
      }
      right={
        <>
          <Pressable hitSlop={10} onPress={onFollow} accessibilityLabel={following ? "Unfollow" : "Add friend"} className="mr-5 active:opacity-60">
            <Ionicons name={following ? "person-remove-outline" : "person-add-outline"} size={22} color={following ? ORANGE : TEXT} />
          </Pressable>
          <Pressable hitSlop={10} onPress={onShare} accessibilityLabel="Share profile" className="mr-5 active:opacity-60">
            <Ionicons name="share-social-outline" size={22} color={TEXT} />
          </Pressable>
          <Pressable hitSlop={10} onPress={more} accessibilityLabel="More" className="active:opacity-60">
            <Ionicons name="ellipsis-vertical" size={20} color={TEXT} />
          </Pressable>
        </>
      }
    />
  );
}

/* ---------- type-specific sections ---------- */

/** Favourite classes and the racers someone follows: every member has these. */
function PeopleTab({ view }: { view: ProfileView }) {
  const router = useRouter();
  const f = view.fan;
  if (!f || (f.favoriteClasses.length === 0 && f.followedRacers.length === 0)) {
    return <Text className="px-5 py-12 text-center text-[14px] text-paddock-muted">{view.isMe ? "Racers you follow will show up here" : "Not following any racers yet"}</Text>;
  }
  return (
    <>
      {f.favoriteClasses.length > 0 && (
        <View className="mt-6 px-5">
          <SectionLabel>Favorite classes</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {f.favoriteClasses.map((c) => (
              <View key={c} className="border border-paddock-border bg-paddock-surface px-3 py-1.5">
                <Text className="text-[13px] uppercase tracking-[1px] text-paddock-text">{c}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {f.followedRacers.length > 0 && (
        <View className="mt-8">
          <View className="px-5">
            <SectionLabel>Following racers</SectionLabel>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-5">
            {f.followedRacers.map((r) => (
              <Pressable
                key={r.id}
                disabled={!r.username}
                onPress={() => r.username && router.push({ pathname: "/user/[username]", params: { username: r.username } })}
                className="w-[120px] bg-paddock-surface p-3 active:opacity-70"
              >
                <Text className="text-[22px] font-semibold text-paddock-orange">{r.carNumber ? `#${r.carNumber}` : "—"}</Text>
                <Text numberOfLines={2} className="mt-1 text-[14px] text-paddock-text">
                  {r.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );
}

function EventsBlock({ view }: { view: ProfileView }) {
  const t = view.track;
  return (
    <View className="mt-8 px-5">
      <SectionLabel>Upcoming events</SectionLabel>
      {t && t.events.length > 0 ? (
        <View className="gap-2">
          {t.events.map((e) => (
            <View key={e.id} className="flex-row items-center bg-paddock-surface px-4 py-4">
              <Text className="w-20 text-[14px] font-semibold uppercase text-paddock-orange">
                {new Date(`${e.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
              <Text className="flex-1 text-[16px] text-paddock-text">{e.title}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="px-1 text-[14px] text-paddock-muted">No upcoming events</Text>
      )}
    </View>
  );
}

const TAB_LABEL: Record<Tab, string> = { posts: "Posts", car: "Car and sponsor spots", results: "Race results", saved: "Saved", liked: "Liked", people: "Following" };

/** Which tabs a profile gets: racers have a car and results, members have people, owners have saved and liked. */
function tabsFor(view: ProfileView): Tab[] {
  const t: Tab[] = ["posts"];
  if (view.isRacer) t.push("car", "results");
  if (view.isMe) t.push("saved", "liked");
  if (!view.isRacer && view.userType !== "track") t.push("people");
  return t;
}

function ProfileTabs({ tabs, tab, setTab, carBadge = 0 }: { tabs: Tab[]; tab: Tab; setTab: (t: Tab) => void; carBadge?: number }) {
  return (
    <View className="mt-3 flex-row border-b border-paddock-surface px-3">
      {tabs.map((t) => (
        <Pressable
          key={t}
          onPress={() => {
            Haptics.selectionAsync();
            setTab(t);
          }}
          accessibilityRole="tab"
          accessibilityLabel={TAB_LABEL[t]}
          accessibilityState={{ selected: tab === t }}
          className="flex-1 items-center py-2.5 active:opacity-70"
        >
          <Text className={`text-[10px] font-extrabold uppercase tracking-[1.4px] ${tab === t ? "text-paddock-orange" : "text-paddock-muted"}`}>{TAB_LABEL[t].split(" ")[0]}</Text>
          {t === "car" && carBadge > 0 && (
            <View className="absolute right-[18%] top-1 h-[16px] min-w-[16px] items-center justify-center rounded-full bg-paddock-orange px-1">
              <Text className="text-[11px] font-semibold text-white">{carBadge > 9 ? "9+" : carBadge}</Text>
            </View>
          )}
          {tab === t && <View className="absolute bottom-0 h-[2px] w-full bg-paddock-orange" />}
        </Pressable>
      ))}
    </View>
  );
}

/** Compact header shown on the Car and Results tabs. */
function CompactHeader({ view, right, avatar }: { view: ProfileView; right: string; avatar?: React.ReactNode }) {
  const r = view.racer;
  const sub = [r?.carNumber ? `#${r.carNumber}` : null, r?.racingClass, r?.teamName].filter(Boolean).join(" · ") || `@${view.username}`;
  return (
    <View className="flex-row items-start px-4 pt-3">
      {avatar ? <View className="mr-3">{avatar}</View> : null}
      <View className="flex-1 pr-3">
        <View className="flex-row items-center">
          <Text numberOfLines={1} className="flex-shrink text-[20px] font-extrabold text-paddock-text">
            {view.name}
          </Text>
          {view.isVerified && <Ionicons name="checkmark-circle" size={16} color="#5cc8ff" style={{ marginLeft: 5 }} />}
        </View>
        {sub ? (
          <Text numberOfLines={1} className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.8px] text-paddock-orange">
            {sub}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <View className="bg-paddock-orange px-2 py-1">
          <Text className="text-[9px] font-extrabold uppercase tracking-[0.6px] text-[#0b0b0d]">{right}</Text>
        </View>
        {r && (
          <Text numberOfLines={1} className="mt-2 text-[10px] font-bold uppercase tracking-[0.4px] text-paddock-text">
            GT World Challenge
          </Text>
        )}
      </View>
    </View>
  );
}

function PartnerTile({ name }: { name: string }) {
  const code = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 4) || name.slice(0, 4);
  return (
    <View className="min-w-[22%] flex-1 items-center border border-paddock-border bg-paddock-surface px-2 py-3">
      <Text numberOfLines={1} className="text-[13px] font-extrabold uppercase tracking-[1px] text-paddock-text">
        {code}
      </Text>
      <Text numberOfLines={1} className="mt-1 text-[8px] font-bold uppercase tracking-[0.7px] text-paddock-orange">
        {name}
      </Text>
    </View>
  );
}

function EscrowNotice() {
  return (
    <View className="mx-5 mt-4 flex-row border border-paddock-border bg-[#130f0d] px-3 py-3">
      <Ionicons name="shield-checkmark-outline" size={18} color={ORANGE} />
      <View className="ml-3 flex-1">
        <Text className="text-[10px] font-extrabold uppercase tracking-[1px] text-paddock-text">Automated escrow protection</Text>
        <Text className="mt-0.5 text-[10px] leading-[14px] text-paddock-muted">Sponsorship payouts released on FIA scrutineering sign-off.</Text>
      </View>
    </View>
  );
}

function CarTab({ view }: { view: ProfileView }) {
  const r = view.racer;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const changePhoto = async () => {
    if (!view.isMe || busy) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 10], quality: 0.85 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      await setCarPhoto(view.id, { uri: asset.uri, file: asset.file });
      await qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      Alert.alert("Couldn't upload photo", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SponsorshipSection view={view} onChangePhoto={view.isMe ? changePhoto : undefined} photoBusy={busy} />

      <View className="mt-6 px-5">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-[11px] font-extrabold uppercase tracking-[1px] text-paddock-text">Current season partners</Text>
          <View className="flex-row items-center gap-3">
            <Text className="text-[10px] font-bold uppercase text-paddock-muted">{r?.partners.length ?? 0} Active</Text>
            <Text className="text-[10px] font-bold uppercase text-paddock-orange">Manage</Text>
          </View>
        </View>
        {r && r.partners.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {r.partners.map((n) => <PartnerTile key={n} name={n} />)}
          </View>
        ) : (
          <Text className="text-[13px] text-paddock-muted">No partners yet this season</Text>
        )}
      </View>
      <EscrowNotice />
    </View>
  );
}

// Results open with the 5 most recent, then the full list fills in behind them.
const RESULTS_FIRST = 5;

const POSITION_NOTE = (pos: number | null) => (pos === 1 ? "Winner" : pos && pos <= 3 ? "Podium" : "Points");
const resultDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function ResultRow({ r, onDelete }: { r: RaceResultRow; onDelete?: () => void }) {
  const win = r.position === 1;
  return (
    <Pressable onLongPress={onDelete} delayLongPress={400} className="flex-row items-center border-b border-paddock-surface px-5 py-4">
      <View className="flex-1 pr-3">
        <Text className="text-[15px] font-semibold text-paddock-text">{r.title}</Text>
        <View className="mt-1 flex-row flex-wrap items-center">
          {r.venue ? <Text className="mr-2 text-[12px] text-paddock-muted">{r.venue}</Text> : null}
          {r.verified && (
            <View className="border border-paddock-orange/60 px-1.5 py-[1px]">
              <Text className="text-[10px] text-paddock-orange">Verified</Text>
            </View>
          )}
        </View>
        <Text className="mt-1 text-[12px] text-paddock-muted">{[resultDate(r.raceDate), r.classLabel].filter(Boolean).join(" · ")}</Text>
      </View>
      <View className="items-end">
        <Text className={`text-[24px] font-semibold ${win ? "text-paddock-orange" : r.position && r.position <= 3 ? "text-paddock-text" : "text-paddock-muted"}`}>
          {r.position ? `P${r.position}` : "—"}
        </Text>
        <Text className="text-[11px] text-paddock-muted">{POSITION_NOTE(r.position)}</Text>
      </View>
    </Pressable>
  );
}

function ResultsTab({ view }: { view: ProfileView }) {
  const qc = useQueryClient();
  const recent = useQuery({ queryKey: ["raceResults", view.id, "recent"], queryFn: () => fetchRaceResults(view.id, RESULTS_FIRST), staleTime: 60_000 });
  const full = useQuery({
    queryKey: ["raceResults", view.id, "all"],
    queryFn: () => fetchRaceResults(view.id),
    enabled: recent.isSuccess && recent.data.length >= RESULTS_FIRST,
    staleTime: 60_000,
  });
  // show whatever is ready: the full list once it arrives, the recent five before that
  const q = full.isSuccess ? full : recent;
  const [adding, setAdding] = useState(false);

  const addButton = view.isMe && (
    <Pressable onPress={() => setAdding(true)} accessibilityRole="button" className="mx-5 mt-4 h-11 items-center justify-center border border-dashed border-paddock-border active:opacity-70">
      <Text className="text-[13px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">+ Add race result</Text>
    </Pressable>
  );
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["raceResults", view.id] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  };
  const confirmDelete = (r: RaceResultRow) => {
    if (!view.isMe || r.verified) return;
    Alert.alert(`Remove "${r.title}"?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteRaceResult(r.id);
            refresh();
          } catch (e) {
            Alert.alert("Couldn't remove", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  };

  let body: React.ReactNode;
  if (q.isPending) body = <ActivityIndicator color={ORANGE} className="mt-10" />;
  else if (q.isError)
    body = (
      <Pressable onPress={() => q.refetch()} className="items-center py-10 active:opacity-70">
        <Text className="text-[14px] text-paddock-muted">Couldn't load results. Tap to retry.</Text>
      </Pressable>
    );
  else if (q.data.length === 0) body = <Text className="px-5 py-10 text-center text-[14px] text-paddock-muted">{view.isMe ? "Your race results will show up here" : "No race results yet"}</Text>;
  else
    body = (
      <View className="mt-2">
        {q.data.map((r) => (
          <ResultRow key={r.id} r={r} onDelete={() => confirmDelete(r)} />
        ))}
        {view.isMe && <Text className="px-5 pt-3 text-[12px] text-paddock-muted">Press and hold a result to remove it.</Text>}
      </View>
    );

  return (
    <View>
      {addButton}
      {body}
      <ResultSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false);
          refresh();
        }}
      />
    </View>
  );
}

/** One obvious way into sponsorship: manage spots (owner) or sponsor this racer (visitor). */
function SponsorButton({ view, offers, onOpen, onMessage, messaging }: { view: ProfileView; offers: number; onOpen: () => void; onMessage: () => void; messaging: boolean }) {
  const first = view.name.split(" ")[0] || view.name;
  const hasOpenSpots = view.decals.some((d) => d.available);

  if (!view.isMe && !hasOpenSpots) {
    return (
      <Pressable onPress={onMessage} disabled={messaging} accessibilityRole="button" className="mx-5 mt-3 h-12 flex-row items-center justify-center rounded-lg border border-paddock-orange/60 active:opacity-80">
        {messaging ? <ActivityIndicator color={ORANGE} /> : <Text className="text-[13px] font-bold uppercase tracking-[1.5px] text-paddock-text">Message about sponsoring</Text>}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" className="mx-5 mt-3 h-12 flex-row items-center justify-center rounded-lg bg-paddock-orange active:opacity-80">
      <Ionicons name="shield-checkmark-outline" size={18} color="#0b0b0d" />
      <Text className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-[#0b0b0d]">{view.isMe ? "Manage sponsor spots" : `Sponsor ${first}`}</Text>
      {view.isMe && offers > 0 && (
        <View className="ml-2 rounded-full bg-[#0b0b0d] px-2 py-0.5">
          <Text className="text-[11px] font-semibold text-paddock-orange">{offers} new</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Wins / podiums / titles / years, with the car line underneath. */
function CareerCard({ view }: { view: ProfileView }) {
  const r = view.racer;
  if (!r) return null;
  const cells = [
    { v: r.careerWins, l: "Wins" },
    { v: r.podiums, l: "Podiums" },
    { v: r.championships, l: "Titles" },
    { v: r.yearsRacing, l: "Years" },
  ];
  const line = [r.carNumber ? `#${r.carNumber}` : null, r.racingClass, r.teamName, view.location].filter(Boolean).join(" · ");
  return (
    <View className="mx-5 mt-4 overflow-hidden rounded-lg border border-paddock-border bg-paddock-surface/60">
      <View className="flex-row py-4">
        {cells.map((c, i) => (
          <View key={c.l} className={`flex-1 items-center ${i > 0 ? "border-l border-paddock-border" : ""}`}>
            <Text className="text-[22px] font-bold text-paddock-text">{c.v}</Text>
            <Text className="mt-0.5 text-[10px] font-semibold uppercase tracking-[1.5px] text-paddock-muted">{c.l}</Text>
          </View>
        ))}
      </View>
      {line ? (
        <View className="border-t border-paddock-border px-4 py-2.5">
          <Text numberOfLines={1} className="text-[11px] uppercase tracking-[1px] text-paddock-muted">
            {line}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- screen ---------- */

export function Profile({ view, onRefresh, refreshing }: { view: ProfileView; onRefresh?: () => void; refreshing?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile, refreshProfile } = useAuth();
  const isOwner = view.isMe;

  const [following, setFollowing] = useState(view.isFollowing);
  const [followers, setFollowers] = useState(view.followers);
  const [imageBusy, setImageBusy] = useState<"avatar" | "banner" | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [tab, setTab] = useState<Tab>(view.isRacer ? "car" : "posts");
  const [menuOpen, setMenuOpen] = useState(false);
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setFollowing(view.isFollowing);
    setFollowers(view.followers);
  }, [view.isFollowing, view.followers]);

  // first tab is already on screen: warm the others in the background so a tap shows data instantly
  useEffect(() => {
    if (!profile) return;
    const t = setTimeout(() => {
      if (tab !== "posts") qc.prefetchInfiniteQuery({ ...gridQuery("posts", view.id, profile.id), pages: 1 });
      if (view.isMe) {
        qc.prefetchInfiniteQuery({ ...gridQuery("saved", view.id, profile.id), pages: 1 });
        qc.prefetchInfiniteQuery({ ...gridQuery("liked", view.id, profile.id), pages: 1 });
      }
      if (view.isRacer && tab !== "results") qc.prefetchQuery({ queryKey: ["raceResults", view.id, "recent"], queryFn: () => fetchRaceResults(view.id, RESULTS_FIRST), staleTime: 60_000 });
    }, 900);
    return () => clearTimeout(t);
  }, [qc, profile, view.id, view.isMe, view.isRacer]); // eslint-disable-line react-hooks/exhaustive-deps

  const subline =
    view.userType === "track"
      ? [view.track?.location ?? view.location, view.track?.capacity ? `${compact(view.track.capacity)} capacity` : null].filter(Boolean).join(" • ")
      : null;
  const tabs = tabsFor(view);
  // swipe the tab area left / right to move between the tabs
  const tabSwipe = useSwipe((dir) => {
    const i = tabs.indexOf(tab);
    const next = tabs[dir === "left" ? i + 1 : i - 1];
    if (!next) return;
    Haptics.selectionAsync();
    setTab(next);
  });
  const newOffers = useNewOfferCount();
  const spotsOpen = view.decals.filter((d) => d.available).length;
  // racers get the compact header on every tab; the owner also gets it on saved / liked
  const compactHeader = tab === "car" || tab === "results" || (tab !== "people" && (view.isRacer || tab === "saved" || tab === "liked"));
  const compactBadge =
    tab === "car" ? `${spotsOpen} ${spotsOpen === 1 ? "Spot" : "Spots"} Open` : tab === "results" ? `${view.racer?.podiums ?? 0} Podiums Total` : tab === "saved" ? "Saved Posts" : tab === "liked" ? "Liked Posts" : "Feed";

  const stats =
    view.userType === "track"
      ? [compact(followers), String(view.track?.events.length ?? 0), compact(view.likesCount)]
      : [compact(view.following), compact(followers), compact(view.likesCount)];
  const statLabels = view.userType === "track" ? ["Followers", "Events", "Likes"] : ["Following", "Followers", "Likes"];

  const shareProfile = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({ message: `${view.name} (@${view.username}) on Heatlap` });
    } catch {
      // cancelled
    }
  };

  const toggleFollow = async () => {
    if (!profile || isOwner) return; // you can't follow yourself
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const next = !following;
    setFollowing(next);
    setFollowers((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      await setFollow(view.id, profile.id, next);
      qc.invalidateQueries({ queryKey: ["feed"] });
    } catch {
      setFollowing(!next);
      setFollowers((n) => Math.max(0, n + (next ? -1 : 1)));
      Alert.alert("Couldn't update follow", "Check your connection and try again.");
    }
  };

  const openChat = async () => {
    if (messaging) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMessaging(true);
    try {
      const id = await startChat(view.id);
      router.push({ pathname: "/chat/[id]", params: { id } });
    } catch (e) {
      Alert.alert("Couldn't start chat", messageError(e));
    } finally {
      setMessaging(false);
    }
  };

  const changeImage = async (kind: "avatar" | "banner") => {
    if (!profile || imageBusy) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: kind === "avatar" ? [1, 1] : [16, 9],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setImageBusy(kind);
    try {
      await uploadProfileImage(profile.id, { uri: asset.uri, file: asset.file }, kind);
      await Promise.all([refreshProfile(), qc.invalidateQueries({ queryKey: ["profile"] })]);
    } catch (e) {
      Alert.alert("Couldn't upload image", e instanceof Error ? e.message : "Try again.");
    } finally {
      setImageBusy(null);
    }
  };

  // Follow + Message: shown under both the full and the compact header, so a visitor can always message
  const visitorButtons = (
    <>
      <Pressable
        onPress={toggleFollow}
        accessibilityRole="button"
        className={`h-11 flex-1 items-center justify-center rounded-lg active:opacity-80 ${following ? "border border-paddock-border bg-paddock-surface" : "bg-paddock-orange"}`}
      >
        <Text className="text-[13px] font-bold uppercase tracking-[1.5px] text-paddock-text">{following ? "Following" : "Follow"}</Text>
      </Pressable>
      <Pressable
        onPress={openChat}
        disabled={messaging}
        accessibilityRole="button"
        accessibilityLabel={`Message ${view.name}`}
        className="h-11 flex-1 flex-row items-center justify-center rounded-lg border border-paddock-border active:opacity-70"
      >
        {messaging ? <ActivityIndicator color={TEXT} /> : <Ionicons name="chatbubble-outline" size={18} color={TEXT} />}
        {!messaging && <Text className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-paddock-text">Message</Text>}
      </Pressable>
    </>
  );

  return (
    <View className="flex-1 bg-paddock-bg">
      <SafeAreaView edges={["top"]} className="z-10 bg-paddock-bg">
        {isOwner ? <OwnerNavbar view={view} onMenu={() => setMenuOpen((o) => !o)} /> : <PublicNavbar view={view} onShare={shareProfile} following={following} onFollow={toggleFollow} />}
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-24"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={ORANGE} /> : undefined}
      >
        {compactHeader ? (
          <>
            <CompactHeader view={view} right={compactBadge} avatar={<Avatar view={view} square size={52} onEdit={isOwner ? () => changeImage("avatar") : undefined} busy={imageBusy === "avatar"} />} />
            {!isOwner && <View className="mt-3 flex-row gap-3 px-4">{visitorButtons}</View>}
          </>
        ) : (
          <>
        {/* Identity: name on the left, avatar on the right */}
        <View className="flex-row items-start px-5 pt-5">
          <View className="flex-1 pr-4">
            <View className="flex-row items-center">
              <Text numberOfLines={2} className="flex-shrink text-[28px] font-bold leading-[32px] text-paddock-text">
                {view.name}
              </Text>
              {view.isVerified && <Ionicons name="checkmark-circle" size={20} color={ORANGE} style={{ marginLeft: 8 }} />}
            </View>
            <Text className="mt-1 text-[15px] text-paddock-muted">@{view.username}</Text>
            {subline ? <Text className="mt-2 text-[12px] uppercase tracking-[1px] text-paddock-muted">{subline}</Text> : null}
          </View>
          <Avatar view={view} square size={84} onEdit={isOwner ? () => changeImage("avatar") : undefined} busy={imageBusy === "avatar"} />
        </View>

        {/* Stats */}
        <View className="mt-5 flex-row px-5">
          {stats.map((v, i) => (
            <Stat key={statLabels[i]} value={v} label={statLabels[i]} />
          ))}
        </View>

        <View className="px-5">
          {view.bio ? (
            <View className="mt-4"><BioText text={view.bio} /></View>
          ) : isOwner ? (
            <Pressable onPress={() => router.push("/edit-profile")} className="mt-4 active:opacity-70">
              <Text className="text-[15px] text-paddock-muted">Add a bio</Text>
            </Pressable>
          ) : null}
        </View>

        {view.isRacer && <CareerCard view={view} />}

        {!isOwner && view.liveStreamId && (
          <Pressable
            onPress={() => router.push({ pathname: "/livestream/watch/[id]", params: { id: view.liveStreamId! } })}
            accessibilityRole="button"
            accessibilityLabel={`Watch ${view.name} live`}
            className="mx-5 mt-5 flex-row items-center bg-[#2a1a14] px-4 py-3.5 active:opacity-80"
          >
            <View className="mr-3 h-3 w-3 rounded-full bg-paddock-orange" />
            <Text className="flex-1 text-[15px] font-semibold uppercase tracking-[1.5px] text-paddock-peach">Live now</Text>
            <Text className="mr-2 text-[15px] font-semibold text-paddock-text">Watch</Text>
            <Ionicons name="chevron-forward" size={18} color="#f2f0ee" />
          </Pressable>
        )}

        {/* Actions */}
        <View className="mt-5 flex-row gap-3 px-5">
          {isOwner ? (
            <>
              <Pressable
                onPress={() => router.push("/edit-profile")}
                accessibilityRole="button"
                className="h-11 flex-1 items-center justify-center rounded-lg border border-paddock-border active:opacity-80"
              >
                <Text className="text-[13px] font-bold uppercase tracking-[1.5px] text-paddock-text">Edit profile</Text>
              </Pressable>
              <Pressable
                onPress={shareProfile}
                accessibilityRole="button"
                className="h-11 flex-1 items-center justify-center rounded-lg border border-paddock-border active:opacity-70"
              >
                <Text className="text-[13px] font-bold uppercase tracking-[1.5px] text-paddock-text">Share profile</Text>
              </Pressable>
            </>
          ) : (
            visitorButtons
          )}
        </View>

        {view.isRacer && (
          <SponsorButton
            view={view}
            offers={isOwner ? newOffers : 0}
            onOpen={() => {
              Haptics.selectionAsync();
              setTab("car");
            }}
            onMessage={openChat}
            messaging={messaging}
          />
        )}

        {view.userType === "track" && <EventsBlock view={view} />}
          </>
        )}

        {view.isMe && view.userType === "sponsor" && (
          <Pressable onPress={() => router.push("/sponsorship/offers")} accessibilityRole="button" className="mx-5 mt-4 flex-row items-center justify-between border border-paddock-border bg-paddock-surface px-4 py-3.5 active:opacity-80">
            <View className="flex-row items-center">
              <Ionicons name="briefcase-outline" size={20} color={ORANGE} />
              <Text className="ml-3 text-[15px] font-semibold text-paddock-text">My sponsor offers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={MUTED} />
          </Pressable>
        )}

        <View {...tabSwipe} className="min-h-[420px]">
          <ProfileTabs tabs={tabs} tab={tab} setTab={setTab} carBadge={view.isMe ? newOffers : 0} />
          {tab === "posts" && <PostsGrid userId={view.id} isMe={view.isMe} />}
          {tab === "saved" && <PostsGrid userId={view.id} isMe source="saved" />}
          {tab === "liked" && <PostsGrid userId={view.id} isMe source="liked" />}
          {tab === "car" && <CarTab view={view} />}
          {tab === "results" && <ResultsTab view={view} />}
          {tab === "people" && <PeopleTab view={view} />}
        </View>
      </ScrollView>

      {/* Hamburger dropdown: sits under the top bar, tap anywhere else to close */}
      {menuOpen && (
        <>
          <Pressable onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" className="absolute inset-0 z-20" />
          <View style={{ top: insets.top + (isOwner ? 92 : 52) }} className="absolute right-4 z-30 w-44 border border-paddock-border bg-paddock-surface">
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                router.push("/edit-profile");
              }}
              accessibilityRole="menuitem"
              className="flex-row items-center px-4 py-3.5 active:bg-white/5"
            >
              <Ionicons name="create-outline" size={18} color={TEXT} />
              <Text className="ml-3 text-[15px] text-paddock-text">Edit profile</Text>
            </Pressable>
            <View className="h-[1px] bg-paddock-border" />
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                signOut();
              }}
              accessibilityRole="menuitem"
              className="flex-row items-center px-4 py-3.5 active:bg-white/5"
            >
              <Ionicons name="log-out-outline" size={18} color="#ff7a5c" />
              <Text className="ml-3 text-[15px] text-[#ff7a5c]">Log out</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
