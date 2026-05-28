import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { api, resolveMediaUrl } from '../lib/api';
import type { Story, StoryCategory, StoryRead } from '../lib/types';
import {
  BookOpen, Search, Tag, Clock, ChevronRight, LogOut,
  Star, TrendingUp, Library, Loader2, BookmarkCheck
} from 'lucide-react';
import MangaReader from './MangaReader';

export default function UserDashboard() {
  const { profile, signOut } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [reads, setReads] = useState<StoryRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<StoryCategory | 'all'>('all');
  const [readingStory, setReadingStory] = useState<Story | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [storiesData, readsData] = await Promise.all([
        api.getPublishedStories(),
        api.getMyReads(),
      ]);
      setStories(storiesData as any);
      setReads(readsData);
    } finally {
      setLoading(false);
    }
  };

  const getReadForStory = (storyId: string) => reads.find(r => r.story_id === storyId);

  const filteredStories = stories.filter(s => {
    if (filterCategory !== 'all' && s.category !== filterCategory) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) &&
        !s.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categories = [...new Set(stories.map(s => s.category))];
  const completedCount = reads.filter(r => r.completed).length;
  const inProgressCount = reads.filter(r => !r.completed && r.last_panel_read > 0).length;

  if (readingStory) {
    return (
      <MangaReader
        story={readingStory}
        onClose={() => { setReadingStory(null); fetchData(); }}
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
              <p className="text-[10px] text-red-400 tracking-[0.2em] uppercase -mt-0.5">Manga Stories</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                {completedCount} completed
              </span>
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                {inProgressCount} in progress
              </span>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm text-white font-medium">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-slate-400">{profile?.department || profile?.email}</p>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-12">
        {/* Hero Section */}
        <div className="relative mb-10 p-8 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/50">
          <div className="absolute inset-0">
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl" />
          </div>
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Welcome back, {profile?.full_name?.split(' ')[0] || 'Reader'}
            </h2>
            <p className="text-slate-400 text-lg mb-6">
              Discover corporate knowledge told through engaging manga narratives
            </p>
            <div className="relative max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-800/80 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                placeholder="Search stories..."
              />
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filterCategory === 'all'
                ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Library className="w-4 h-4 inline mr-1.5" />
            All Stories
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat as StoryCategory)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filterCategory === cat
                  ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
                  : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Tag className="w-3.5 h-3.5 inline mr-1.5" />
              {cat}
            </button>
          ))}
        </div>

        {/* Continue Reading */}
        {reads.filter(r => !r.completed && r.last_panel_read > 0).length > 0 && (
          <div className="mb-10">
            <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              Continue Reading
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reads
                .filter(r => !r.completed && r.last_panel_read > 0)
                .map(read => {
                  const story = stories.find(s => s.id === read.story_id);
                  if (!story) return null;
                  const panelCount = (story as any).story_panels?.[0]?.count || 1;
                  const progress = Math.round((read.last_panel_read / panelCount) * 100);
                  return (
                    <button
                      key={read.id}
                      onClick={() => setReadingStory(story)}
                      className="group bg-slate-900/80 border border-slate-700/50 rounded-xl p-4 text-left hover:border-amber-500/30 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        {story.cover_image_url ? (
                          <img src={resolveMediaUrl(story.cover_image_url)} alt="" className="w-16 h-20 rounded-lg object-contain bg-slate-900 flex-shrink-0" />
                        ) : (
                          <div className="w-16 h-20 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-6 h-6 text-slate-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium text-sm truncate">{story.title}</h4>
                          <p className="text-slate-500 text-xs mt-0.5">{story.category}</p>
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                              <span>Panel {read.last_panel_read} of {panelCount}</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* All Stories */}
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
          <Star className="w-5 h-5 text-red-400" />
          {filterCategory === 'all' ? 'All Stories' : filterCategory}
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : filteredStories.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">No stories found</p>
            <p className="text-slate-500 text-sm mt-1">Check back later for new manga stories</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredStories.map((story) => {
              const read = getReadForStory(story.id);
              const panelCount = (story as any).story_panels?.[0]?.count || 0;
              const isCompleted = read?.completed;
              const isStarted = read && read.last_panel_read > 0;

              return (
                <button
                  key={story.id}
                  onClick={() => setReadingStory(story)}
                  className="group bg-slate-900/80 border border-slate-700/50 rounded-xl overflow-hidden text-left hover:border-red-500/30 hover:shadow-lg hover:shadow-red-500/5 transition-all"
                >
                  {/* Cover */}
                  <div className="relative h-52 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
                    {story.cover_image_url ? (
                      <img src={resolveMediaUrl(story.cover_image_url)} alt="" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-slate-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3">
                      <span className="px-2 py-1 text-xs font-medium bg-slate-900/80 text-slate-300 rounded-md border border-slate-600/50 backdrop-blur-sm">
                        {story.category}
                      </span>
                    </div>
                    {isCompleted && (
                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/30 backdrop-blur-sm flex items-center gap-1">
                          <BookmarkCheck className="w-3 h-3" />
                          Read
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="text-white font-semibold text-sm line-clamp-2 drop-shadow-lg">{story.title}</h3>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <p className="text-slate-400 text-xs line-clamp-2 mb-3">{story.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{panelCount} panels</span>
                        {story.published_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(story.published_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-red-400 transition-colors" />
                    </div>
                    {isStarted && !isCompleted && (
                      <div className="mt-2">
                        <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                            style={{ width: `${Math.round((read.last_panel_read / panelCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
