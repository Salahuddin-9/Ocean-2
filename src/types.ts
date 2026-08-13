export interface Project {
  id: string;
  title: string;
  description: string;
  demoUrl: string;
  githubUrl: string;
  tags: string[];
}

export interface WebsiteItem {
  id: string;
  title: string;
  description: string;
  demoUrl: string;
  githubUrl: string;
  thumbnailUrl: string; // Base64 image upload or empty
  techStack: string[];
}

export interface ContactInfo {
  email: string;
  github: string;
  linkedin: string;
  twitter: string;
  website: string;
}

export interface Comment {
  id: string;
  senderId?: string | null;
  senderName: string;
  senderAvatarUrl?: string;
  text: string;
  timestamp: string;
  parentId?: string | null;
  reactions?: Record<string, string[]>; // emoji -> array of user/sender names
  image?: string;
  audioUrl?: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  date: string;
  createdTime?: number;
  createdAt?: string;
  timestamp?: number;
  likes: number;
  comments?: Comment[];
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  voiceUrl?: string;
  isNsfw?: boolean;
  nsfwVerdict?: 'safe' | 'blur' | 'block';
  likedBy?: string[];
  likedByUsers?: { id: string; name: string; avatarUrl: string }[];
  isRepost?: boolean;
  repostedFrom?: { id: string; name: string };
  repostsCount?: number;
  originalPostId?: string;
  isTimeCapsule?: boolean;
  unlockDate?: string; // ISO date-time string
  lockedAtDate?: string; // ISO date-time string when created
  followersSuggested?: boolean;
  isAnonymous?: boolean;
  anonymousCreatorId?: string;
  anonymousCreatorName?: string;
  creator?: { id: string; name: string; avatarUrl?: string };
  authorName?: string;
  authorAvatarUrl?: string;
  authorId?: string;
  reactions?: Record<string, string[]>; // ReactionType -> userIds (multi-reaction system)
  isNeedPost?: boolean;
  needType?: 'blood' | 'football' | 'other';
  needStatus?: 'active' | 'fulfilled';
  needLocation?: string;
  needBox?: string;
  needTime?: string;
  needUrgency?: 'urgent' | 'normal';
  needTexts?: { id: string; senderId: string; senderName: string; text: string; timestamp: string }[];
  sharesCount?: number;
  clicksCount?: number;
  impressionsCount?: number;
  impressionsData?: { date: string; impressions: number }[];
  viewsByCountry?: Record<string, number>;
}

export interface UserProfile {
  id?: string;
  name: string;
  username?: string;
  avatarUrl: string; // Base64 or local path
  bio: string;
  tagline: string; // E.g., "Full-stack Developer & Designer"
  location: string;
  availability: 'Available' | 'Busy' | 'Freelance' | 'Mentoring' | 'Single' | 'Married' | 'Engaged' | 'Moved on' | 'In a relationship' | 'Divorced';
  badgeNumber: string; // Custom stylized ID, e.g., "BD-44-230-11-98"
  sinceDate: string; // E.g., "July 2026"
  viewsCount: number;
  followersCount: number;
  postsCount: number;
  projectsCount: number;
  skillsCount: number;
  isLocationVerified?: boolean;
  countryCode?: string | null;
  skills: string[];
  projects: Project[];
  websites: WebsiteItem[];
  contact: ContactInfo;
  posts?: Post[];
  savedPostIds?: string[];
  isMessageLocked?: boolean;
  isRestricted?: boolean;
  isPrivate?: boolean;
  allowConnections?: boolean;
  isPublicMessagingEnabled?: boolean;
  friendsPrivacy?: 'public' | 'friends' | 'private';
}
