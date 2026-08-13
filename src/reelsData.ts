export interface Reel {
  id: string;
  title: string;
  category: string;
  creatorId: string;
  creatorName: string;
  avatarUrl?: string;
  imageUrl: string;
  videoUrl?: string;
  views: string;
  viewsCount?: number;
  likes: number;
  caption: string;
}

export const REELS_CATEGORIES = [
  'Trending',
  'Interface Design',
  'Secure Tech',
  'Art & Aesthetics'
];

export const MOCK_REELS: Reel[] = [];
