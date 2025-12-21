import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, MessageSquare, Clock } from 'lucide-react';
import api from '../../api/client';

interface FeedbackDialogProps {
  itemId: string;
  itemType: 'draft' | 'candidate' | 'mapping';
  onClose: () => void;
  onSubmit: () => void;
}

const CATEGORIES = [
  { value: 'incorrect_content', label: 'Incorrect Content' },
  { value: 'wrong_level', label: 'Wrong CEFR Level' },
  { value: 'poor_quality', label: 'Poor Quality' },
  { value: 'missing_context', label: 'Missing Context' },
  { value: 'grammatical_error', label: 'Grammatical Error' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'off_topic', label: 'Off Topic' },
  { value: 'other', label: 'Other' },
];

export function FeedbackDialog({ itemId, itemType, onClose, onSubmit }: FeedbackDialogProps) {
  const [action, setAction] = useState<'reject' | 'revise' | 'flag'>('reject');
  const [category, setCategory] = useState('');
  const [comment, setComment] = useState('');
  const [suggestedCorrection, setSuggestedCorrection] = useState('');
  const queryClient = useQueryClient();

  const { data: templates } = useQuery({
    queryKey: ['feedback-templates', category],
    queryFn: () => api.get<{ templates: Array<{ id: string; name: string; template_text: string }> }>(`/operational/feedback/templates?category=${category}`),
    enabled: !!category,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; id: string }>('/operational/feedback', {
        itemId,
        itemType,
        action,
        category,
        comment,
        suggestedCorrection: suggestedCorrection || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['candidates'] });
      void queryClient.invalidateQueries({ queryKey: ['drafts'] });
      onSubmit();
    },
  });

  const applyTemplate = (templateText: string, templateId: string): void => {
    setComment(templateText);
    void api.post(`/operational/feedback/templates/${templateId}/use`, {}).catch(() => {
      // Ignore errors when using template
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Provide Feedback</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Action</label>
            <div className="flex gap-2">
              {[
                { value: 'reject', label: 'Reject', icon: X, color: 'red' },
                { value: 'revise', label: 'Request Revision', icon: MessageSquare, color: 'yellow' },
                { value: 'flag', label: 'Flag for Review', icon: Clock, color: 'blue' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAction(opt.value as 'reject' | 'revise' | 'flag')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded border ${
                    action === opt.value
                      ? opt.value === 'reject'
                        ? 'bg-red-100 border-red-500 text-red-700'
                        : opt.value === 'revise'
                          ? 'bg-yellow-100 border-yellow-500 text-yellow-700'
                          : 'bg-blue-100 border-blue-500 text-blue-700'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <opt.icon className="w-4 h-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select category...</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {templates?.templates && templates.templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Quick Templates</label>
              <div className="flex flex-wrap gap-2">
                {templates.templates.slice(0, 5).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.template_text, t.id)}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              Comment <span className="text-red-500">*</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
              placeholder="Explain what's wrong and why..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {comment.length}/2000 characters (min 10)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Suggested Correction (optional)
            </label>
            <textarea
              value={suggestedCorrection}
              onChange={(e) => setSuggestedCorrection(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-20"
              placeholder="How should this be corrected?"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            Cancel
          </button>
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!category || comment.length < 10 || submitMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}

