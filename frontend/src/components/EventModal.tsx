import { Sparkles, RefreshCcw } from "lucide-react";
import type { ChangeEvent } from "react";
import type { PostRecord } from "../types";

interface EventModalProps {
  post: PostRecord;
  eventJson: string;
  eventJsonError: string | null;
  extractEventError: string | null;
  isExtracting: boolean;
  hasGemini: boolean;
  onClose: () => void;
  onJsonChange: (value: string) => void;
  onExtract: () => void;
  onSave: () => void;
}

export const EventModal = ({
  post,
  eventJson,
  eventJsonError,
  extractEventError,
  isExtracting,
  hasGemini,
  onClose,
  onJsonChange,
  onExtract,
  onSave,
}: EventModalProps) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold">Event JSON for {post.club.name}</h3>
          <p className="text-sm text-gray-500">Instagram ID: {post.instagram_id}</p>
        </div>
        <button className="text-gray-400 hover:text-gray-600" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="px-6 py-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-gray-600">
            {hasGemini
              ? "Let Gemini read the poster and pre-fill the JSON template."
              : "Add your Gemini API key on the Setup tab to enable automated extraction."}
          </p>
          <button
            onClick={onExtract}
            disabled={isExtracting || !hasGemini}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:bg-purple-300"
          >
            {isExtracting ? (
              <>
                <RefreshCcw className="h-4 w-4 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Extract with Gemini
              </>
            )}
          </button>
        </div>
        {extractEventError && <p className="text-sm text-red-600">{extractEventError}</p>}
        <textarea
          className="w-full h-64 border border-gray-300 rounded-lg p-3 font-mono text-sm"
          placeholder="Paste extracted event JSON here"
          value={eventJson}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onJsonChange(e.target.value)}
        />
        {eventJsonError && <p className="text-sm text-red-600">{eventJsonError}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t px-6 py-4">
        <button className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700" onClick={onClose}>
          Cancel
        </button>
        <button
          onClick={onSave}
          className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-md"
        >
          Save Event JSON
        </button>
      </div>
    </div>
  </div>
);
