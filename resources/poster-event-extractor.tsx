import React, { useState } from 'react';
import { Upload, FileImage, Download, Copy, Check, AlertCircle, Loader2, Eye, X } from 'lucide-react';

const EventPosterExtractor = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  // The exact AI prompt from your specification
  const AI_PROMPT = `# AI Prompt for Event Poster Data Extraction

## Task
Extract all event information from this poster image and return it as structured JSON data.

## Instructions
Analyze the poster carefully and extract ALL available event information. If certain fields are not visible or clear, mark them as null rather than guessing.

## Required Output Format
Return ONLY a valid JSON object (no markdown, no explanation) in this exact structure:

{
  "events": [
    {
      "title": "Event name as shown on poster",
      "description": "Full description or tagline from poster",
      "startDate": "YYYY-MM-DD",
      "startTime": "HH:MM (24-hour format)",
      "endDate": "YYYY-MM-DD (if different from start)",
      "endTime": "HH:MM (if specified)",
      "timezone": "America/Vancouver (or appropriate timezone)",
      "venue": {
        "name": "Venue name",
        "address": "Full street address if shown",
        "city": "City name",
        "region": "Province/State",
        "country": "Country"
      },
      "organizer": "Organization or person hosting",
      "category": "Concert/Workshop/Festival/Sports/Theatre/Community/etc",
      "price": "Price information as shown (e.g., '$20', 'Free', '$15-25')",
      "tags": ["tag1", "tag2"],
      "registrationUrl": "URL if shown",
      "contactInfo": {
        "phone": "Phone number if shown",
        "email": "Email if shown",
        "website": "Website if shown"
      },
      "additionalInfo": "Any other relevant details from poster"
    }
  ],
  "extractionConfidence": {
    "overall": 0.95,
    "notes": "Any issues or uncertainties in extraction"
  }
}

## Field Guidelines

### Dates and Times
- Extract dates in YYYY-MM-DD format
- Use 24-hour time format (HH:MM)
- If only month/day shown, assume current or next year based on context
- If time shows "7 PM" convert to "19:00"
- If date shows "Every Tuesday", note in additionalInfo and use next occurrence

### Venue Information
- Extract complete venue name (e.g., "Prince George Civic Centre")
- Include full address if visible
- Default to city shown on poster or organization location

### Categories (use one of these)
- Concert
- Workshop
- Festival
- Sports
- Theatre
- Comedy
- Conference
- Community
- Education
- Fundraiser
- Market
- Exhibition
- Other

### Price
- Keep original format shown on poster
- "Free" for no-cost events
- Include all pricing tiers if shown (e.g., "$20 advance, $25 door")

### Missing Information
- Set field to null if not present
- Don't invent or guess information
- Note any ambiguities in extractionConfidence.notes

Remember: Output ONLY the JSON object, no additional text or formatting.`;

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setError(null);
      setExtractedData(null);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      setError('Please select a valid image file (PNG, JPG, GIF, etc.)');
    }
  };

  const processWithClaude = async () => {
    if (!selectedFile || !imagePreview) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Convert image to base64 (remove data URL prefix)
      const base64Image = imagePreview.split(',')[1];

      // Call Claude API
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: selectedFile.type,
                    data: base64Image,
                  }
                },
                {
                  type: "text",
                  text: AI_PROMPT
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      let responseText = data.content[0].text;

      // Clean up response - remove any markdown formatting
      responseText = responseText.replace(/```json\s?/g, "").replace(/```\s?/g, "").trim();

      // Parse the JSON response
      try {
        const jsonData = JSON.parse(responseText);
        setExtractedData(jsonData);
      } catch (parseError) {
        // Try to extract JSON from response if it includes extra text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[0]);
          setExtractedData(jsonData);
        } else {
          throw new Error('Could not parse JSON from AI response. Response may not be in the expected format.');
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to process image. Please try again.');
      console.error('Processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    if (extractedData) {
      navigator.clipboard.writeText(JSON.stringify(extractedData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadJSON = () => {
    if (extractedData) {
      const blob = new Blob([JSON.stringify(extractedData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const clearImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setExtractedData(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-8 text-white">
            <h1 className="text-3xl font-bold">AI Event Poster Data Extractor</h1>
            <p className="mt-2 text-blue-100">
              Upload event poster images and extract structured JSON data using AI analysis
            </p>
          </div>

          {/* AI Prompt Info */}
          <div className="px-6 py-4 bg-blue-50 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-blue-900">AI Processing Prompt</h3>
                <p className="text-sm text-blue-700">
                  Using standardized prompt for consistent event data extraction
                </p>
              </div>
              <button
                onClick={() => setShowFullPrompt(!showFullPrompt)}
                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
              >
                <Eye className="h-4 w-4" />
                {showFullPrompt ? 'Hide' : 'View'} Prompt
              </button>
            </div>
            
            {showFullPrompt && (
              <div className="mt-4 bg-white rounded-lg p-4 border">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-auto max-h-96">
                  {AI_PROMPT}
                </pre>
              </div>
            )}
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* Upload Section */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Upload Poster Image</h2>
                  
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-all duration-200 bg-gray-50 hover:bg-gray-100">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer block">
                      {imagePreview ? (
                        <div className="relative">
                          <img 
                            src={imagePreview} 
                            alt="Poster preview" 
                            className="max-h-80 mx-auto rounded-lg shadow-md"
                          />
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              clearImage();
                            }}
                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <p className="mt-4 text-sm text-gray-600">
                            Click to select a different image
                          </p>
                        </div>
                      ) : (
                        <div>
                          <FileImage className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                          <p className="text-lg text-gray-600 mb-2">
                            Click to upload a poster image
                          </p>
                          <p className="text-sm text-gray-500">
                            Supports PNG, JPG, GIF, WebP (max 20MB)
                          </p>
                        </div>
                      )}
                    </label>
                  </div>

                  {selectedFile && (
                    <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                      <p className="text-sm text-gray-700">
                        <strong>File:</strong> {selectedFile.name}
                      </p>
                      <p className="text-sm text-gray-700">
                        <strong>Size:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  )}
                </div>

                {selectedFile && (
                  <button
                    onClick={processWithClaude}
                    disabled={isProcessing}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-3 text-lg font-medium"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Processing with AI...
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5" />
                        Extract Event Data
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Results Section */}
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900">2. Extracted JSON Data</h2>
                
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex">
                      <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Processing Error</h3>
                        <p className="text-sm text-red-700 mt-1">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {extractedData ? (
                  <div className="space-y-4">
                    {/* Preview Card */}
                    {extractedData.events && extractedData.events.length > 0 && (
                      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
                        <h3 className="font-medium text-gray-900 mb-2">Event Preview</h3>
                        <div className="text-sm space-y-1">
                          <p><strong>Title:</strong> {extractedData.events[0].title || 'Not specified'}</p>
                          <p><strong>Date:</strong> {extractedData.events[0].startDate || 'Not specified'}</p>
                          <p><strong>Venue:</strong> {extractedData.events[0].venue?.name || 'Not specified'}</p>
                          <p><strong>Category:</strong> {extractedData.events[0].category || 'Not specified'}</p>
                        </div>
                      </div>
                    )}

                    {/* JSON Display */}
                    <div className="bg-gray-900 rounded-lg overflow-hidden">
                      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
                        <span className="text-green-400 text-sm font-mono">JSON Output</span>
                        <div className="flex gap-2">
                          <button
                            onClick={copyToClipboard}
                            className="text-gray-300 hover:text-white transition-colors"
                            title="Copy to clipboard"
                          >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={downloadJSON}
                            className="text-gray-300 hover:text-white transition-colors"
                            title="Download JSON file"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4 overflow-auto max-h-96">
                        <pre className="text-green-400 text-sm font-mono whitespace-pre">
                          {JSON.stringify(extractedData, null, 2)}
                        </pre>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={copyToClipboard}
                        className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy JSON
                          </>
                        )}
                      </button>
                      
                      <button
                        onClick={downloadJSON}
                        className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download JSON
                      </button>
                    </div>

                    {/* Confidence Score */}
                    {extractedData.extractionConfidence && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-medium text-blue-900 mb-2">Extraction Quality</h3>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm text-blue-700">Confidence:</span>
                          <div className="flex-1 bg-blue-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${(extractedData.extractionConfidence.overall || 0) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-blue-900">
                            {Math.round((extractedData.extractionConfidence.overall || 0) * 100)}%
                          </span>
                        </div>
                        {extractedData.extractionConfidence.notes && (
                          <p className="text-sm text-blue-700">
                            <strong>Notes:</strong> {extractedData.extractionConfidence.notes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Usage Instructions */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h3 className="font-medium text-gray-900 mb-2">Next Steps</h3>
                      <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                        <li>Review the extracted data for accuracy</li>
                        <li>Edit any fields that need correction</li>
                        <li>Copy or download the JSON data</li>
                        <li>Import into your event management system</li>
                      </ol>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-12 text-center border-2 border-dashed border-gray-300">
                    <FileImage className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-500 text-lg">
                      Upload and process a poster image to see extracted JSON data here
                    </p>
                    <p className="text-gray-400 text-sm mt-2">
                      The AI will analyze your poster and extract structured event information
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventPosterExtractor;