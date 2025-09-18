import React, { useState, useEffect } from 'react';
import { Upload, Download, Play, Pause, Monitor, Image, CheckCircle, XCircle, Clock, Eye, Settings, FileText, Database, Zap } from 'lucide-react';

const InstagramEventMonitor = () => {
  const [clubs, setClubs] = useState([]);
  const [csvFile, setCsvFile] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [posts, setPosts] = useState([]);
  const [eventPosts, setEventPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('setup');

  // Mock data for demonstration
  const mockPosts = [
    {
      id: '1',
      club: 'Prince George Arts Council',
      username: 'pgac_events',
      imageUrl: '/api/placeholder/400/600',
      caption: 'Join us for a magical evening of music and art! Summer Concert Series 2025 🎵',
      timestamp: '2025-01-15T10:30:00Z',
      isEventPoster: null,
      confidence: null,
      processed: false
    },
    {
      id: '2',
      club: 'University of Northern BC',
      username: 'unbc_official',
      imageUrl: '/api/placeholder/400/600',
      caption: 'Beautiful campus shot this morning ☀️ #UNBC #PrinceGeorge',
      timestamp: '2025-01-15T08:15:00Z',
      isEventPoster: false,
      confidence: 0.85,
      processed: true
    },
    {
      id: '3',
      club: 'Downtown BIA',
      username: 'downtownpg',
      imageUrl: '/api/placeholder/400/600',
      caption: 'Winter Festival is coming! Mark your calendars for February 10-12! ❄️🎉',
      timestamp: '2025-01-14T16:45:00Z',
      isEventPoster: true,
      confidence: 0.92,
      processed: true
    }
  ];

  useEffect(() => {
    setPosts(mockPosts);
  }, []);

  const handleCsvUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
      
      // Parse CSV and extract club list (mock implementation)
      const mockClubs = [
        { name: 'Prince George Arts Council', username: 'pgac_events', active: true },
        { name: 'University of Northern BC', username: 'unbc_official', active: true },
        { name: 'Downtown BIA', username: 'downtownpg', active: true },
        { name: 'PG Sports Complex', username: 'pgsports', active: false },
        { name: 'Two Rivers Gallery', username: 'tworiversart', active: true }
      ];
      setClubs(mockClubs);
    }
  };

  const toggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
    if (!isMonitoring) {
      // Start monitoring simulation
      console.log('Starting Instagram monitoring...');
    } else {
      console.log('Stopping Instagram monitoring...');
    }
  };

  const classifyPost = async (postId) => {
    // Simulate AI classification
    const updatedPosts = posts.map(post => {
      if (post.id === postId) {
        // Mock classification result
        const isEvent = Math.random() > 0.5;
        return {
          ...post,
          isEventPoster: isEvent,
          confidence: Math.random() * 0.3 + 0.7, // 0.7 to 1.0
          processed: true
        };
      }
      return post;
    });
    setPosts(updatedPosts);
  };

  const processEventPoster = async (post) => {
    setSelectedPost(post);
    setIsProcessing(true);
    
    try {
      // Mock AI processing - in reality, this would call your poster extraction API
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const mockEventData = {
        events: [{
          title: "Winter Festival 2025",
          description: "A magical celebration of winter with music, food, and family fun",
          startDate: "2025-02-10",
          startTime: "18:00",
          endDate: "2025-02-12",
          endTime: "22:00",
          timezone: "America/Vancouver",
          venue: {
            name: "Downtown Prince George",
            address: "1100 Patricia Blvd",
            city: "Prince George",
            region: "BC",
            country: "Canada"
          },
          organizer: "Downtown BIA",
          category: "Festival",
          price: "Free",
          tags: ["winter", "festival", "family", "downtown"],
          registrationUrl: null,
          contactInfo: {
            phone: "(250) 555-0123",
            email: "events@downtownpg.ca",
            website: "downtownpg.ca"
          },
          additionalInfo: "Food trucks and live music throughout the weekend"
        }],
        extractionConfidence: {
          overall: 0.89,
          notes: "All major event details clearly visible on poster"
        }
      };
      
      setExtractedData(mockEventData);
    } catch (error) {
      console.error('Error processing poster:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const eventPostsFiltered = posts.filter(post => post.isEventPoster === true);
  const pendingPosts = posts.filter(post => post.isEventPoster === null);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg mb-8">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-8 text-white rounded-t-xl">
            <h1 className="text-3xl font-bold">Instagram Event Poster Monitor</h1>
            <p className="mt-2 text-purple-100">
              Automatically detect and process event posters from club Instagram accounts
            </p>
          </div>
          
          {/* Navigation */}
          <div className="border-b">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'setup', label: 'Setup', icon: Settings },
                { id: 'monitor', label: 'Monitor', icon: Monitor },
                { id: 'classify', label: 'Classify', icon: Image },
                { id: 'events', label: 'Events', icon: CheckCircle },
                { id: 'logs', label: 'Logs', icon: Database }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === id
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-4 w-4 inline mr-2" />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Setup Tab */}
        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Upload Club List</h2>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg text-gray-600">Upload CSV with club usernames</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Format: name, username, active
                  </p>
                </label>
              </div>
              {csvFile && (
                <p className="mt-4 text-sm text-green-600">
                  ✓ Loaded: {csvFile.name}
                </p>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Monitored Clubs</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {clubs.map((club, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{club.name}</p>
                      <p className="text-sm text-gray-500">@{club.username}</p>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs ${
                      club.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {club.active ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Monitor Tab */}
        {activeTab === 'monitor' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Monitoring Status</h2>
              <button
                onClick={toggleMonitoring}
                className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 ${
                  isMonitoring
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {isMonitoring ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <Monitor className="h-8 w-8 text-blue-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-blue-900">Status</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {isMonitoring ? 'Active' : 'Stopped'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <Image className="h-8 w-8 text-green-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-green-900">Posts Collected</p>
                    <p className="text-lg font-semibold text-green-600">{posts.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <CheckCircle className="h-8 w-8 text-purple-600" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-purple-900">Events Found</p>
                    <p className="text-lg font-semibold text-purple-600">{eventPostsFiltered.length}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Recent Activity</h3>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  15:30 - Checked @pgac_events - 2 new posts
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  15:25 - Checked @unbc_official - 1 new post
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  15:20 - Checked @downtownpg - 0 new posts
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Classify Tab */}
        {activeTab === 'classify' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-6">Classify Pending Posts</h2>
            
            {pendingPosts.length === 0 ? (
              <div className="text-center py-12">
                <Image className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500">No pending posts to classify</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingPosts.map(post => (
                  <div key={post.id} className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-200 h-48 flex items-center justify-center">
                      <span className="text-gray-500">Post Image</span>
                    </div>
                    <div className="p-4">
                      <p className="font-medium">{post.club}</p>
                      <p className="text-sm text-gray-500 mb-2">@{post.username}</p>
                      <p className="text-sm mb-3 line-clamp-2">{post.caption}</p>
                      <button
                        onClick={() => classifyPost(post.id)}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
                      >
                        Classify with AI
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === 'events' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-6">Detected Event Posters</h2>
            
            {eventPostsFiltered.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500">No event posters detected yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {eventPostsFiltered.map(post => (
                  <div key={post.id} className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-200 h-48 flex items-center justify-center">
                      <span className="text-gray-500">Event Poster</span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{post.club}</p>
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                          {Math.round(post.confidence * 100)}% Event
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mb-2">@{post.username}</p>
                      <p className="text-sm mb-3 line-clamp-2">{post.caption}</p>
                      <button
                        onClick={() => processEventPoster(post)}
                        disabled={isProcessing}
                        className="w-full bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
                      >
                        <Zap className="h-4 w-4" />
                        Extract Event Data
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-6">Processing Logs</h2>
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 h-96 overflow-y-auto">
              <div>[2025-01-15 15:35:22] Starting Instagram monitor...</div>
              <div>[2025-01-15 15:35:23] Loaded 5 club accounts from CSV</div>
              <div>[2025-01-15 15:35:24] Checking @pgac_events...</div>
              <div>[2025-01-15 15:35:25] Found 2 new posts from @pgac_events</div>
              <div>[2025-01-15 15:35:26] Classifying post pgac_001 with AI...</div>
              <div>[2025-01-15 15:35:28] Post pgac_001: Event poster detected (confidence: 0.92)</div>
              <div>[2025-01-15 15:35:29] Checking @unbc_official...</div>
              <div>[2025-01-15 15:35:30] Found 1 new post from @unbc_official</div>
              <div>[2025-01-15 15:35:31] Classifying post unbc_001 with AI...</div>
              <div>[2025-01-15 15:35:33] Post unbc_001: Not an event poster (confidence: 0.85)</div>
              <div>[2025-01-15 15:35:34] Checking @downtownpg...</div>
              <div>[2025-01-15 15:35:35] Found 1 new post from @downtownpg</div>
              <div>[2025-01-15 15:35:36] Classifying post dpg_001 with AI...</div>
              <div>[2025-01-15 15:35:38] Post dpg_001: Event poster detected (confidence: 0.89)</div>
              <div>[2025-01-15 15:35:39] Processing event poster dpg_001...</div>
              <div>[2025-01-15 15:35:42] Extracted event data for "Winter Festival 2025"</div>
              <div>[2025-01-15 15:35:43] Saved to EventScrape database</div>
            </div>
          </div>
        )}

        {/* Event Processing Modal */}
        {selectedPost && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold">Processing Event Poster</h3>
                  <button
                    onClick={() => {
                      setSelectedPost(null);
                      setExtractedData(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-2">Original Post</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-200 h-64 flex items-center justify-center">
                        <span className="text-gray-500">Event Poster Image</span>
                      </div>
                      <div className="p-4">
                        <p className="font-medium">{selectedPost.club}</p>
                        <p className="text-sm text-gray-500">@{selectedPost.username}</p>
                        <p className="text-sm mt-2">{selectedPost.caption}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Extracted Event Data</h4>
                    {isProcessing ? (
                      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
                          <p className="text-gray-600">Processing with AI...</p>
                        </div>
                      </div>
                    ) : extractedData ? (
                      <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="text-sm whitespace-pre-wrap">
                          {JSON.stringify(extractedData, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
                        <p className="text-gray-500">Click "Extract Event Data" to process</p>
                      </div>
                    )}

                    {extractedData && (
                      <div className="mt-4 flex gap-2">
                        <button className="flex-1 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700">
                          Save to EventScrape
                        </button>
                        <button className="flex-1 bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700">
                          Download JSON
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstagramEventMonitor;