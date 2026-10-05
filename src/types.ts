
export enum Difficulty {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced'
}

export interface RoadmapNode {
  id: string;
  title: string;
  description: string;
  status: 'locked' | 'available' | 'completed';
  type: 'concept' | 'quiz' | 'playground' | 'lab';
  xp: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
  xp: number;
  level: number;
  streak: number;
  rank: string;
}

export interface CodeSubmission {
  code: string;
  language: string;
  output?: string;
  error?: string;
  aiFeedback?: string;
}

// ── Dynamic Roadmap Types ──

export interface Subtopic {
  id: string;
  title: string;
  description: string;
  content: string;  // AI-generated detailed content (loaded lazily)
}

export interface RoadmapLevel {
  id: string;
  order: number;
  title: string;
  description: string;
  theoryContent: string;     // overview content (markdown)
  subtopics: Subtopic[];     // navigable sub-modules
  imageQuery?: string;       // search term for illustrative image
  xpReward: number;
  quiz: QuizQuestion[];
}

/** Where a roadmap's curriculum came from. */
export interface RoadmapSource {
  source?: 'roadmap.sh' | 'ai' | string;
  sourceSlug?: string;
  sourceUrl?: string;
  sourceProvider?: string;
}

export interface GeneratedRoadmap {
  id: string;
  topic: string;
  createdAt: string;
  levels: RoadmapLevel[];
  dbId?: number;
  source?: RoadmapSource | null;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizResult {
  levelId: string;
  score: number;
  total: number;
  answers: number[];          // user-selected indices
  submittedAt: string;
}

export interface UserProgress {
  visitorId: string;          // localStorage identifier
  roadmaps: RoadmapProgress[];
  totalXp: number;
  rewards: string[];          // earned reward IDs
}

export interface RoadmapProgress {
  roadmapId: string;
  topic: string;
  completedLevels: string[];  // level IDs
  quizResults: QuizResult[];
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpThreshold: number;
}
