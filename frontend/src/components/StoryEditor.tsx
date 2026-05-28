import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { api, resolveMediaUrl } from '../lib/api';
import type { Story, StoryPanel, Document, StoryCategory, PanelType } from '../lib/types';
import { STORY_CATEGORIES } from '../lib/types';
import {
  ArrowLeft, Save, Plus, Trash2, Upload, FileText, Image,
  Sparkles, Loader2, GripVertical, MessageSquare, BookOpen,
  Zap, FileCheck, ChevronUp, ChevronDown, X, Eye, Volume2
} from 'lucide-react';

interface Props {
  story: Story | null;
  onClose: () => void;
}

const PANEL_TYPES: { value: PanelType; label: string; icon: any }[] = [
  { value: 'cover', label: 'Cover', icon: BookOpen },
  { value: 'narration', label: 'Narration', icon: FileText },
  { value: 'dialogue', label: 'Dialogue', icon: MessageSquare },
  { value: 'action', label: 'Action', icon: Zap },
  { value: 'summary', label: 'Summary', icon: FileCheck },
];

export default function StoryEditor({ story, onClose }: Props) {
  const { profile } = useAuth();
  const [workingStoryId, setWorkingStoryId] = useState(story?.id || '');
  const isNew = !workingStoryId;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(story?.title || '');
  const [description, setDescription] = useState(story?.description || '');
  const [category, setCategory] = useState<StoryCategory>(story?.category || 'Summary');
  const [contextPrompt, setContextPrompt] = useState(story?.context_prompt || '');
  const [coverImageUrl, setCoverImageUrl] = useState(story?.cover_image_url || '');
  const [panels, setPanels] = useState<StoryPanel[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [generatingNarration, setGeneratingNarration] = useState(false);
  const [narrationError, setNarrationError] = useState('');
  const [previewPanel, setPreviewPanel] = useState<StoryPanel | null>(null);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (workingStoryId) {
      loadPanels();
      loadDocuments();
    }
  }, [workingStoryId]);

  useEffect(() => {
    console.log('[StoryEditor] init', {
      storyId: workingStoryId || null,
      isNew,
      profileId: profile?.id ?? null,
      profileRole: profile?.role ?? null,
      apiBaseUrlPresent: Boolean(import.meta.env.VITE_API_BASE_URL),
    });
  }, [workingStoryId, isNew, profile?.id, profile?.role]);

  const loadPanels = async () => {
    if (!workingStoryId) return;
    console.log('[StoryEditor] loadPanels start', { storyId: workingStoryId });
    const data = await api.getStoryPanels(workingStoryId);
    console.log('[StoryEditor] loadPanels done', { count: data.length });
    setPanels(data);
  };

  const loadDocuments = async () => {
    if (!workingStoryId) return;
    console.log('[StoryEditor] loadDocuments start', { storyId: workingStoryId });
    const data = await api.getStoryDocuments(workingStoryId);
    console.log('[StoryEditor] loadDocuments done', { count: data.length });
    setDocuments(data);
  };

  const saveStoryDetails = async () => {
    const storyPayload = {
      title: title.trim(),
      description,
      category,
      context_prompt: contextPrompt,
      cover_image_url: coverImageUrl || null,
    };

    const savedStory = workingStoryId
      ? await api.updateStory(workingStoryId, storyPayload as any)
      : await api.createStory({ ...storyPayload, status: 'draft' });

    setWorkingStoryId(savedStory.id);
    return savedStory;
  };

  const panelPayload = panels.map((panel) => ({
    panel_number: panel.panel_number,
    title: panel.title,
    narrative_text: panel.narrative_text,
    narration_audio_url: panel.narration_audio_url || null,
    narration_duration_ms: panel.narration_duration_ms || null,
    image_url: panel.image_url || null,
    image_prompt: panel.image_prompt,
    panel_type: panel.panel_type,
    character_name: panel.character_name || '',
    character_dialogue: panel.character_dialogue || '',
  }));

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaveError('');
    setSaving(true);
    try {
      console.log('[StoryEditor] handleSave start', {
        isNew,
        existingStoryId: workingStoryId || null,
        titleLen: title.length,
        panelsCount: panels.length,
        profileId: profile?.id ?? null,
        profileRole: profile?.role ?? null,
      });

      const savedStory = await saveStoryDetails();

      if (panels.length > 0) {
        await api.replaceStoryPanels(savedStory.id, panelPayload as any);
        console.log('[StoryEditor] handleSave replaced panels', { count: panelPayload.length });
      }

      console.log('[StoryEditor] handleSave success', { storyId: savedStory.id });
      onClose();
    } catch (err: any) {
      console.error('Save error:', err);
      setSaveError(err.message || 'Failed to save story. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePanels = async () => {
    if (!title.trim()) {
      setGenerationError('Add a title before generating manga panels.');
      return;
    }

    console.log('[StoryEditor] handleGeneratePanels start', {
      storyId: workingStoryId || null,
      isNew,
      titleLen: title.length,
      contextLen: contextPrompt.length,
      category,
      documentsCount: documents.length,
      profileRole: profile?.role ?? null,
    });

    setGenerating(true);
    setGenerationError('');
    try {
      const savedStory = await saveStoryDetails();
      const result = await api.generateManga(savedStory.id, {
        title: title.trim(),
        description,
        context: contextPrompt,
        category,
        document_ids: documents.map(d => d.id),
      });

      if (!result.success) {
        throw new Error('Generation did not return success');
      }

      console.log('[StoryEditor] generate-manga success summary', {
        panels_generated: result.panels_generated,
        panelsCount: result.panels.length,
      });

      setPanels(result.panels);
      if (result.panels?.[0]?.image_url) {
        setCoverImageUrl(result.panels[0].image_url);
      }
      await loadDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Generation error:', err);
      console.log('[StoryEditor] handleGeneratePanels caught', { message });
      setGenerationError(message || 'Failed to generate manga panels.');
    } finally {
      setGenerating(false);
      console.log('[StoryEditor] handleGeneratePanels done');
    }
  };

  const handleGenerateNarration = async () => {
    if (!title.trim()) {
      setNarrationError('Add a title before generating narration.');
      return;
    }
    if (panels.length === 0) {
      setNarrationError('Generate or add panels before generating narration.');
      return;
    }

    setGeneratingNarration(true);
    setNarrationError('');
    try {
      const savedStory = await saveStoryDetails();
      await api.replaceStoryPanels(savedStory.id, panelPayload as any);
      const result = await api.generateNarration(savedStory.id);
      setPanels(result.panels);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setNarrationError(message || 'Failed to generate story narration.');
    } finally {
      setGeneratingNarration(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !workingStoryId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadDocument(workingStoryId, file);
      }
      await loadDocuments();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addPanel = () => {
    const newPanel: StoryPanel = {
      id: `temp-${Date.now()}`,
      story_id: workingStoryId,
      panel_number: panels.length + 1,
      title: '',
      narrative_text: '',
      image_url: null,
      narration_audio_url: null,
      narration_duration_ms: null,
      image_prompt: '',
      panel_type: 'narration',
      character_name: '',
      character_dialogue: '',
      created_at: new Date().toISOString(),
    };
    setPanels([...panels, newPanel]);
  };

  const updatePanel = (index: number, updates: Partial<StoryPanel>) => {
    const updated = [...panels];
    updated[index] = { ...updated[index], ...updates };
    setPanels(updated);
  };

  const removePanel = (index: number) => {
    const updated = panels.filter((_, i) => i !== index);
    updated.forEach((p, i) => { p.panel_number = i + 1; });
    setPanels(updated);
  };

  const movePanel = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === panels.length - 1)) return;
    const updated = [...panels];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
    updated.forEach((p, i) => { p.panel_number = i + 1; });
    setPanels(updated);
  };

  const deleteDocument = async (doc: Document) => {
    await api.deleteDocument(doc.id);
    loadDocuments();
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-xl border-b border-slate-700/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-white font-semibold">
              {isNew ? 'Create New Story' : 'Edit Story'}
            </h1>
          </div>
          {saveError && (
            <span className="text-red-400 text-xs mr-2">{saveError}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Story Details */}
        <section className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-red-400" />
            Story Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-300 mb-1.5">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                placeholder="Enter story title..."
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-300 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all resize-none"
                placeholder="Brief description of the story..."
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as StoryCategory)}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
              >
                {STORY_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Cover Image URL</label>
              <input
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                placeholder="https://..."
              />
            </div>
          </div>
        </section>

        {/* Context & Prompt */}
        <section className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            Story Context & Prompt
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Provide the context and instructions for generating the manga. This guides how the story is structured into panels.
          </p>
          <textarea
            value={contextPrompt}
            onChange={(e) => setContextPrompt(e.target.value)}
            rows={5}
            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all resize-none font-mono text-sm"
            placeholder="Example: Create a manga about the new HR onboarding process. The story follows a new hire named Tanaka-san as they navigate their first week at Nomura. Include key training modules, compliance requirements, and team introductions. Tone should be friendly and encouraging."
          />
          <button
            onClick={handleGeneratePanels}
            disabled={generating}
            className="mt-4 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 text-white text-sm font-medium rounded-lg hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? 'Generating Manga Panels...' : 'Generate Manga Panels'}
          </button>
          {generationError && (
            <p className="text-red-400 text-sm mt-2">{generationError}</p>
          )}
        </section>

        {/* Documents */}
        {workingStoryId && (
          <section className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" />
              Source Documents
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              Upload reference documents (PDFs, presentations, etc.) that provide content for the manga.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.pptx,.docx,.txt,.md"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2.5 border-2 border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-white hover:border-slate-500 transition-all w-full flex items-center justify-center gap-2"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? 'Uploading...' : 'Upload Documents'}
            </button>
            {documents.length > 0 && (
              <div className="mt-4 space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <div>
                        <p className="text-sm text-white">{doc.file_name}</p>
                        <p className="text-xs text-slate-500">{(doc.file_size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteDocument(doc)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Panels */}
        <section className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Image className="w-5 h-5 text-emerald-400" />
              Manga Panels ({panels.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleGenerateNarration}
                disabled={generatingNarration || generating || panels.length === 0}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
              >
                {generatingNarration ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
                {generatingNarration ? 'Generating...' : 'Generate Narration'}
              </button>
              <button
                onClick={addPanel}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-sm rounded-lg hover:bg-slate-700 transition-all flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Panel
              </button>
            </div>
          </div>
          {narrationError && (
            <p className="text-red-400 text-sm mb-4">{narrationError}</p>
          )}

          {panels.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-700/50 rounded-xl">
              <Image className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No panels yet</p>
              <p className="text-slate-500 text-sm mt-1">Generate panels from your prompt or add them manually</p>
            </div>
          ) : (
            <div className="space-y-4">
              {panels.map((panel, index) => (
                <div
                  key={panel.id}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden"
                >
                  {/* Panel Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-mono text-slate-500">#{panel.panel_number}</span>
                      <select
                        value={panel.panel_type}
                        onChange={(e) => updatePanel(index, { panel_type: e.target.value as PanelType })}
                        className="px-2 py-1 bg-slate-700/50 border border-slate-600/50 rounded text-xs text-slate-300 focus:outline-none"
                      >
                        {PANEL_TYPES.map(pt => (
                          <option key={pt.value} value={pt.value}>{pt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPreviewPanel(panel)}
                        className="p-1.5 text-slate-400 hover:text-white transition-all"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => movePanel(index, 'up')}
                        className="p-1.5 text-slate-400 hover:text-white transition-all"
                        disabled={index === 0}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => movePanel(index, 'down')}
                        className="p-1.5 text-slate-400 hover:text-white transition-all"
                        disabled={index === panels.length - 1}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removePanel(index)}
                        className="p-1.5 text-slate-400 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Panel Content */}
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Text content */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Panel Title</label>
                        <input
                          value={panel.title}
                          onChange={(e) => updatePanel(index, { title: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                          placeholder="Panel title..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Narrative Text</label>
                        <textarea
                          value={panel.narrative_text}
                          onChange={(e) => updatePanel(index, { narrative_text: e.target.value })}
                          rows={3}
                          className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                          placeholder="Narration text..."
                        />
                      </div>
                      {(panel.panel_type === 'dialogue' || panel.panel_type === 'action') && (
                        <>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Character Name</label>
                            <input
                              value={panel.character_name || ''}
                              onChange={(e) => updatePanel(index, { character_name: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                              placeholder="Character name..."
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Dialogue</label>
                            <input
                              value={panel.character_dialogue || ''}
                              onChange={(e) => updatePanel(index, { character_dialogue: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                              placeholder="Character dialogue..."
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Right: Image */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Image URL</label>
                        <input
                          value={panel.image_url || ''}
                          onChange={(e) => updatePanel(index, { image_url: e.target.value || null })}
                          className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                          placeholder="https://..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Image Prompt</label>
                        <textarea
                          value={panel.image_prompt}
                          onChange={(e) => updatePanel(index, { image_prompt: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                          placeholder="Prompt for generating this panel's image..."
                        />
                      </div>
                      {panel.image_url && (
                        <div className="relative rounded-lg overflow-hidden border border-slate-600/50 bg-slate-900 aspect-[2/3] max-h-96">
                          <img src={resolveMediaUrl(panel.image_url)} alt="" className="w-full h-full object-contain" />
                        </div>
                      )}
                      {panel.narration_audio_url && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Narration Audio</label>
                          <audio
                            controls
                            src={resolveMediaUrl(panel.narration_audio_url)}
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Panel Preview Modal */}
      {previewPanel && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4" onClick={() => setPreviewPanel(null)}>
          <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
              <h3 className="text-white font-semibold">Panel Preview</h3>
              <button onClick={() => setPreviewPanel(null)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {previewPanel.image_url && (
                <div className="bg-slate-950 rounded-lg mb-4 max-h-[70vh] overflow-hidden">
                  <img src={resolveMediaUrl(previewPanel.image_url)} alt="" className="w-full max-h-[70vh] object-contain" />
                </div>
              )}
              {previewPanel.title && <h4 className="text-white font-medium mb-2">{previewPanel.title}</h4>}
              {previewPanel.narrative_text && (
                <p className="text-slate-300 text-sm mb-3">{previewPanel.narrative_text}</p>
              )}
              {previewPanel.character_name && (
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-red-400 text-xs font-semibold mb-1">{previewPanel.character_name}</p>
                  <p className="text-white text-sm">{previewPanel.character_dialogue}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
