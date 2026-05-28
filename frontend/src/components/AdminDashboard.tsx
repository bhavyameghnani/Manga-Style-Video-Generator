import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { api, resolveMediaUrl } from '../lib/api';
import type { Story, StoryCategory } from '../lib/types';
import { STORY_CATEGORIES } from '../lib/types';
import { BookOpen, Plus, FileText, Settings, LogOut, CreditCard as Edit3, Upload, Clock, Tag, Trash2, Globe, X, Loader2 } from 'lucide-react';
import StoryEditor from './StoryEditor';

type Tab = 'stories' | 'create';

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('stories');
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [filterCategory, setFilterCategory] = useState<StoryCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const fetchStories = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminStories();
      setStories(data as any);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStories(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this story and all its panels?')) return;
    await api.deleteStory(id);
    fetchStories();
  };

  const handlePublish = async (story: Story) => {
    const newStatus = story.status === 'published' ? 'draft' : 'published';
    const updates: any = { status: newStatus };
    if (newStatus === 'published') updates.published_at = new Date().toISOString();
    await api.updateStory(story.id, updates);
    fetchStories();
  };

  const filteredStories = stories.filter(s => {
    if (filterCategory !== 'all' && s.category !== filterCategory) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    return true;
  });

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    generating: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    published: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  };

  if (editingStory) {
    return (
      <StoryEditor
        story={editingStory}
        onClose={() => { setEditingStory(null); fetchStories(); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-xl border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-red-600 to-red-700 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">NOMURA</h1>
              <p className="text-[10px] text-red-400 tracking-[0.2em] uppercase -mt-0.5">Admin Console</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg">
              <Settings className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-red-300 font-medium">Admin</span>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm text-white font-medium">{profile?.full_name || 'Admin'}</p>
              <p className="text-xs text-slate-400">{profile?.email}</p>
            </div>
            <button
              onClick={signOut}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab('stories')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'stories'
                ? 'bg-slate-800 text-white border border-slate-600'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Stories
          </button>
          <button
            onClick={() => { setActiveTab('create'); setEditingStory({} as Story); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'create'
                ? 'bg-slate-800 text-white border border-slate-600'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Plus className="w-4 h-4 inline mr-2" />
            New Story
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as any)}
            className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            <option value="all">All Categories</option>
            {STORY_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="generating">Generating</option>
            <option value="published">Published</option>
          </select>
        </div>

        {/* Stories Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : filteredStories.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">No stories yet</p>
            <p className="text-slate-500 text-sm mt-1">Create your first manga story</p>
            <button
              onClick={() => setEditingStory({} as Story)}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-all"
            >
              <Plus className="w-4 h-4 inline mr-2" />
              Create Story
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
            {filteredStories.map((story) => (
              <div
                key={story.id}
                className="group bg-slate-900/80 border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600 transition-all"
              >
                {/* Cover */}
                <div className="relative h-44 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
                  {story.cover_image_url ? (
                    <img src={resolveMediaUrl(story.cover_image_url)} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
                        <p className="text-slate-600 text-xs mt-2 font-mono">NO COVER</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-3 right-3 flex gap-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-md border ${statusColors[story.status]}`}>
                      {story.status}
                    </span>
                  </div>
                  <div className="absolute top-3 left-3">
                    <span className="px-2 py-1 text-xs font-medium bg-slate-900/80 text-slate-300 rounded-md border border-slate-600/50 backdrop-blur-sm">
                      <Tag className="w-3 h-3 inline mr-1" />
                      {story.category}
                    </span>
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                      onClick={() => setEditingStory(story)}
                      className="p-2.5 bg-slate-800/90 border border-slate-600 rounded-lg text-white hover:bg-slate-700 transition-all"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handlePublish(story)}
                      className={`p-2.5 rounded-lg border transition-all ${
                        story.status === 'published'
                          ? 'bg-slate-800/90 border-slate-600 text-white hover:bg-slate-700'
                          : 'bg-emerald-600/90 border-emerald-500 text-white hover:bg-emerald-500'
                      }`}
                      title={story.status === 'published' ? 'Unpublish' : 'Publish'}
                    >
                      {story.status === 'published' ? <X className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(story.id)}
                      className="p-2.5 bg-red-600/90 border border-red-500 rounded-lg text-white hover:bg-red-500 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-white font-semibold text-sm mb-1 line-clamp-1">{story.title}</h3>
                  <p className="text-slate-400 text-xs line-clamp-2 mb-3">{story.description}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {(story as any).story_panels?.[0]?.count || 0} panels
                      </span>
                      <span className="flex items-center gap-1">
                        <Upload className="w-3 h-3" />
                        {(story as any).documents?.[0]?.count || 0} docs
                      </span>
                    </div>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(story.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
