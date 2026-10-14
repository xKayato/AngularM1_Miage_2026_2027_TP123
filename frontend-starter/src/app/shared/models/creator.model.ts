export interface FollowResponse {
  following: boolean;
}

export interface SubscribeResponse {
  subscribed: boolean;
  expiresAt: string;
}

export interface CreatorStatusResponse {
  isFollowing: boolean;
  isSubscribed: boolean;
  expiresAt: string | null;
}

export interface LikeResponse {
  liked: boolean;
  likesCount: number;
}

export interface FollowItem {
  id: string;
  creator: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface SubscriptionItem {
  id: string;
  creator: {
    id: string;
    name: string;
  };
  active: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface CreatorSummary {
  id: string;
  name: string;
  bio: string;
  profileTags: string[];
  hasAvatar?: boolean;
  avatarUrl: string | null;
  createdAt: string;
  followersCount: number;
  creationsCount: number;
  isFollowing?: boolean;
}

export interface CreatorPublicProfile {
  id: string;
  name: string;
  bio: string;
  profileTags: string[];
  hasAvatar?: boolean;
  avatarUrl: string | null;
  createdAt: string;
  followersCount: number;
  subscribersCount: number;
  creationsCount: number;
  isSelf: boolean;
  userInteractions: {
    isFollowing: boolean;
    isSubscribed: boolean;
    subscriptionExpiresAt: string | null;
  };
  creations: import('./post.model').PostPreview[];
}

export interface CreatorQueryParams {
  query?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

