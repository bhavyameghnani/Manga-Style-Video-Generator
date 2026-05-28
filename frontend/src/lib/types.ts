export type Role = 'admin' | 'user';

export type StoryCategory =
  | 'Summary'
  | 'Training'
  | 'Compliance'
  | 'Product'
  | 'Leadership'
  | 'Culture'
  | 'Finance'
  | 'Other';

export type PanelType = 'cover' | 'narration' | 'dialogue' | 'action' | 'summary';

export interface User {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  department?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Story {
  id: string;
  title: string;
  description: string;
  category: StoryCategory;
  context_prompt: string;
  cover_image_url?: string | null;
  created_by: string;
  status: 'draft' | 'generating' | 'published';
  published_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface StoryPanel {
  id: string;
  story_id: string;
  panel_number: number;
  title: string;
  narrative_text: string;
  narration_audio_url?: string | null;
  narration_duration_ms?: number | null;
  image_url?: string | null;
  image_prompt: string;
  panel_type: PanelType;
  character_name?: string | null;
  character_dialogue?: string | null;
  created_at: string;
}

export interface Document {
  id: string;
  story_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
}

export interface StoryRead {
  id: string;
  story_id: string;
  user_id: string;
  last_panel_read: number;
  completed: boolean;
  created_at: string;
  updated_at?: string;
}

export const STORY_CATEGORIES: { value: StoryCategory; label: string }[] = [
  { value: 'Summary', label: 'Summary' },
  { value: 'Training', label: 'Training' },
  { value: 'Compliance', label: 'Compliance' },
  { value: 'Product', label: 'Product' },
  { value: 'Leadership', label: 'Leadership' },
  { value: 'Culture', label: 'Culture' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Other', label: 'Other' },
];
