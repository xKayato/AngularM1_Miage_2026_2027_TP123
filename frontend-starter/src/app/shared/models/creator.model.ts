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
