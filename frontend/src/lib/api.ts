import type { Document, Profile, Role, Story, StoryCategory, StoryPanel, StoryRead, User } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const TOKEN_KEY = 'manga_auth_token';

export type AuthPayload = {
  token: string;
  user: User;
  profile: Profile;
};

type RequestOptions = RequestInit & { auth?: boolean };

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function resolveMediaUrl(url?: string | null) {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, ...init } = options;
  const finalHeaders = new Headers(headers);

  if (!(init.body instanceof FormData) && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }

  if (auth) {
    const token = getAuthToken();
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: finalHeaders,
  });

  let payload: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    const message = payload?.detail || payload?.error || payload || `Request failed (${response.status})`;
    throw new Error(String(message));
  }

  return payload as T;
}

export const api = {
  async signIn(email: string, password: string) {
    return request<AuthPayload>('/api/auth/signin', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password }),
    });
  },

  async signUp(email: string, password: string, fullName: string, role: Role) {
    return request<AuthPayload>('/api/auth/signup', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password, full_name: fullName, role }),
    });
  },

  async me() {
    return request<{ user: User; profile: Profile }>('/api/auth/me');
  },

  async getAdminStories() {
    return request<Story[]>('/api/admin/stories');
  },

  async getPublishedStories() {
    return request<Story[]>('/api/stories?status=published');
  },

  async createStory(payload: {
    title: string;
    description: string;
    category: StoryCategory;
    context_prompt: string;
    cover_image_url?: string | null;
    status?: string;
  }) {
    return request<Story>('/api/stories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateStory(storyId: string, payload: Partial<Story>) {
    return request<Story>(`/api/stories/${storyId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteStory(storyId: string) {
    return request<{ success: boolean }>(`/api/stories/${storyId}`, { method: 'DELETE' });
  },

  async getStoryPanels(storyId: string) {
    return request<StoryPanel[]>(`/api/stories/${storyId}/panels`);
  },

  async replaceStoryPanels(storyId: string, panels: Partial<StoryPanel>[]) {
    return request<StoryPanel[]>(`/api/stories/${storyId}/panels`, {
      method: 'PUT',
      body: JSON.stringify({ panels }),
    });
  },

  async generateManga(storyId: string, payload: {
    title: string;
    description: string;
    context: string;
    category: StoryCategory;
    document_ids: string[];
  }) {
    return request<{ success: boolean; panels_generated: number; panels: StoryPanel[] }>(`/api/stories/${storyId}/generate-manga`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async generateNarration(storyId: string) {
    return request<{ success: boolean; panels_generated: number; panels: StoryPanel[] }>(`/api/stories/${storyId}/generate-narration`, {
      method: 'POST',
    });
  },

  async getStoryDocuments(storyId: string) {
    return request<Document[]>(`/api/stories/${storyId}/documents`);
  },

  async uploadDocument(storyId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return request<Document>(`/api/stories/${storyId}/documents`, {
      method: 'POST',
      body: formData,
    });
  },

  async deleteDocument(documentId: string) {
    return request<{ success: boolean }>(`/api/documents/${documentId}`, { method: 'DELETE' });
  },

  async getMyReads() {
    return request<StoryRead[]>('/api/me/reads');
  },

  async getOrCreateStoryRead(storyId: string) {
    return request<StoryRead>(`/api/stories/${storyId}/read`, { method: 'POST' });
  },

  async updateReadProgress(readId: string, payload: { last_panel_read: number; completed: boolean }) {
    return request<StoryRead>(`/api/reads/${readId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};
