export type UserType = "fan" | "racer" | "track" | "sponsor";
export type Visibility = "public" | "followers_only";
export type PostType = "text" | "photo" | "video" | "gallery" | "bulletin";

/** Row from `profiles` (the source of truth for every account). */
export type Profile = {
  id: string;
  username: string | null;
  name: string;
  email: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  location: string | null;
  user_type: UserType;
  /** Anyone can switch this on: shows racer details (car number, season stats). */
  is_racer: boolean;
  is_verified: boolean;
  profile_complete: boolean;
  followers_count: number;
  following_count: number;
};

export type PostAuthor = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  userType: UserType;
  isVerified: boolean;
};

export type PostMedia = {
  id: string;
  kind: "photo" | "video";
  /** Signed URL (empty when it could not be created, see `error`). */
  url: string;
  thumbnailUrl: string | null;
  /** Why no link could be created, shown in place of the image. */
  error?: string | null;
};

export type FeedPost = {
  id: string;
  author: PostAuthor;
  content: string;
  caption: string | null;
  headline: string | null;
  sourceLabel: string | null;
  sessionLabel: string | null;
  telemetry: { trackTemp?: string; gripIdx?: string };
  postType: PostType;
  visibility: Visibility;
  likes: number;
  views: number;
  comments: number;
  createdAt: string;
  media: PostMedia[];
  liked: boolean;
  saved: boolean;
  following: boolean;
  isMine: boolean;
};

export type CommentItem = {
  id: string;
  postId: string;
  parentId: string | null;
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  userType: UserType;
  badge: { label: string; tone: "orange" | "neutral" } | null;
  text: string;
  createdAt: string;
  likes: number;
  liked: boolean;
  replies: CommentItem[];
};

export type ProfileView = {
  id: string;
  userType: UserType;
  /** A member who races (not a track account). */
  isRacer: boolean;
  name: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  location: string | null;
  isVerified: boolean;
  followers: number;
  following: number;
  postsCount: number;
  /** Total likes across their posts. */
  likesCount: number;
  isMe: boolean;
  isFollowing: boolean;
  /** Set while this person is live and I may watch. */
  liveStreamId: string | null;
  racer?: {
    carNumber: string | null;
    racingClass: string | null;
    teamName: string | null;
    careerWins: number;
    podiums: number;
    championships: number;
    carPhotoUrl: string | null;
    partners: string[];
    yearsRacing: number;
    season: { year: number; wins: number; poles: number; bestLapMs: number | null; avgGripIdx: number | null } | null;
  };
  fan?: {
    favoriteClasses: string[];
    followedRacers: { id: string; name: string; username: string | null; carNumber: string | null }[];
  };
  track?: {
    id: string;
    name: string;
    location: string | null;
    capacity: number | null;
    events: { id: string; title: string; date: string }[];
  };
  decals: { id: string; placement: string; xPct: number; yPct: number; description: string | null; minBidCents: number; openBids: number; topBidCents: number | null; available: boolean; pricePerRaceCents: number | null; pricePerSeasonCents: number | null; seasonRaces: number | null }[];
  /** Sections that are still loading after the first paint (so the UI can show a placeholder, not an empty state). */
  loading?: { racer?: boolean; decals?: boolean; fan?: boolean; track?: boolean };
  /** Only populated for the owner. */
  wallet?: { balanceCents: number; earnedThisMonthCents: number };
};

export type ReportReason = "spam" | "harassment" | "hate" | "nudity" | "violence" | "scam" | "other";

export type RaceResultRow = {
  id: string;
  title: string;
  venue: string | null;
  /** "Oct 14, 2024 · Iron Lynx #23" style detail line parts. */
  raceDate: string;
  classLabel: string | null;
  position: number | null;
  points: number | null;
  /** Linked to a track's published event. */
  verified: boolean;
};
