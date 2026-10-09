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
