# Instagram Event Poster Monitoring System
## Technical Architecture & Implementation Guide

## 🏗️ System Overview

This system monitors Instagram posts from club accounts, automatically identifies event posters using AI, and processes them through your event data extraction pipeline.

## 📊 Architecture Components

### 1. Data Collection Layer
**Instagram Monitoring Service**
- **Primary Tools**: Data365 API, HikerAPI, or custom scraping
- **Backup**: Instagram Graph API (for owned accounts)
- **Function**: Collect posts from monitored club accounts

### 2. Image Classification Layer  
**Event Poster Detection**
- **Primary**: Google Cloud Vision API or Azure Computer Vision
- **Secondary**: Custom trained model using Roboflow
- **Function**: Classify if image is an event poster (binary classification)

### 3. Event Data Extraction Layer
**AI Processing Pipeline**
- **Primary**: Your existing Claude-based poster extraction system
- **Function**: Extract structured event data from confirmed event posters

### 4. Data Storage & Management
**Database Schema**
```sql
-- Club monitoring table
clubs (
  id, name, instagram_username, active, last_checked, 
  created_at, updated_at
)

-- Posts collection table  
instagram_posts (
  id, club_id, instagram_post_id, image_url, caption,
  post_timestamp, collected_at, is_event_poster, 
  classification_confidence, processed
)

-- Extracted events table
extracted_events (
  id, post_id, event_data_json, extraction_confidence,
  created_at, imported_to_eventscrape
)
```

## 🛠️ Implementation Tools & APIs

### Instagram Data Collection Options

#### Option 1: Data365 API (Recommended)
```javascript
// No Instagram API approval needed
// Supports public data extraction
// Rate limits: 100 requests/hour
// Cost: ~$64-3,435/month depending on usage

const data365Config = {
  apiKey: 'your-api-key',
  endpoints: {
    userPosts: 'https://api.data365.co/v1/instagram/posts',
    userProfile: 'https://api.data365.co/v1/instagram/profile'
  }
};
```

#### Option 2: HikerAPI 
```javascript
// Professional-grade scraping infrastructure
// 4-5M requests daily capacity
// Pay-per-use model
// Advanced evasion systems

const hikerConfig = {
  apiKey: 'your-api-key',
  baseUrl: 'https://api.hikerapi.com/v1/',
  endpoints: {
    posts: 'instagram/posts',
    profile: 'instagram/profile'
  }
};
```

#### Option 3: Custom Scraping (Advanced)
```python
# Using instagrapi library (Python)
from instagrapi import Client
import schedule
import time

def monitor_account(username):
    cl = Client()
    # Login with dummy account
    cl.login("dummy_user", "dummy_pass")
    
    # Get recent posts
    user_id = cl.user_id_from_username(username)
    posts = cl.user_medias(user_id, amount=20)
    
    return posts
```

### Image Classification APIs

#### Option 1: Google Cloud Vision API
```javascript
const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();

async function classifyEventPoster(imageUrl) {
  const [result] = await client.labelDetection(imageUrl);
  const labels = result.labelAnnotations;
  
  // Look for event-related labels
  const eventKeywords = ['poster', 'flyer', 'event', 'concert', 'festival'];
  const eventScore = labels.filter(label => 
    eventKeywords.some(keyword => 
      label.description.toLowerCase().includes(keyword)
    )
  ).reduce((sum, label) => sum + label.score, 0);
  
  return {
    isEventPoster: eventScore > 0.7,
    confidence: eventScore,
    labels: labels.map(l => ({ text: l.description, score: l.score }))
  };
}
```

#### Option 2: Azure Computer Vision
```javascript
const { ComputerVisionClient } = require('@azure/cognitiveservices-computervision');

async function classifyWithAzure(imageUrl) {
  const result = await computerVisionClient.analyzeImage(imageUrl, {
    visualFeatures: ['Tags', 'Description', 'Objects']
  });
  
  // Custom classification logic
  const eventTags = result.tags.filter(tag => 
    ['poster', 'flyer', 'advertisement', 'announcement'].includes(tag.name)
  );
  
  return {
    isEventPoster: eventTags.length > 0 && eventTags[0].confidence > 0.8,
    confidence: eventTags.length > 0 ? eventTags[0].confidence : 0,
    tags: result.tags
  };
}
```

#### Option 3: Custom Roboflow Model
```javascript
// Pre-trained poster detection model
const roboflowConfig = {
  apiKey: 'your-roboflow-key',
  modelUrl: 'https://detect.roboflow.com/poster-detection-v2',
  version: 2
};

async function detectPosterWithRoboflow(imageUrl) {
  const response = await fetch(`${roboflowConfig.modelUrl}/${roboflowConfig.version}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${roboflowConfig.apiKey}`
    },
    body: JSON.stringify({
      image: imageUrl
    })
  });
  
  const result = await response.json();
  return {
    isEventPoster: result.predictions.length > 0,
    confidence: result.predictions[0]?.confidence || 0,
    detections: result.predictions
  };
}
```

## 🔄 Complete Workflow Implementation

### 1. Club Monitoring Service
```javascript
class InstagramMonitor {
  constructor(config) {
    this.apiClient = new Data365Client(config.data365ApiKey);
    this.classifier = new EventPosterClassifier(config.visionApiKey);
    this.extractor = new EventDataExtractor(config.claudeApiKey);
    this.db = new Database(config.dbConnection);
  }

  async monitorClubs() {
    const clubs = await this.db.getActiveClubs();
    
    for (const club of clubs) {
      try {
        console.log(`Checking ${club.username}...`);
        const posts = await this.getNewPosts(club);
        
        for (const post of posts) {
          await this.processPost(post, club);
        }
        
        await this.db.updateLastChecked(club.id);
      } catch (error) {
        console.error(`Error monitoring ${club.username}:`, error);
      }
    }
  }

  async getNewPosts(club) {
    const lastChecked = club.last_checked || new Date(Date.now() - 24*60*60*1000);
    
    const response = await this.apiClient.getUserPosts({
      username: club.username,
      since: lastChecked,
      limit: 50
    });
    
    return response.posts.filter(post => 
      post.media_type === 'image' && 
      new Date(post.timestamp) > lastChecked
    );
  }

  async processPost(post, club) {
    // Save post to database
    const postRecord = await this.db.savePost({
      club_id: club.id,
      instagram_post_id: post.id,
      image_url: post.media_url,
      caption: post.caption,
      post_timestamp: post.timestamp,
      collected_at: new Date()
    });

    // Classify if it's an event poster
    const classification = await this.classifier.classify(post.media_url);
    
    await this.db.updatePostClassification(postRecord.id, {
      is_event_poster: classification.isEventPoster,
      classification_confidence: classification.confidence
    });

    // If it's an event poster, extract event data
    if (classification.isEventPoster && classification.confidence > 0.8) {
      await this.extractEventData(postRecord);
    }
  }

  async extractEventData(postRecord) {
    try {
      const eventData = await this.extractor.extractFromImage(postRecord.image_url);
      
      await this.db.saveExtractedEvent({
        post_id: postRecord.id,
        event_data_json: JSON.stringify(eventData.events),
        extraction_confidence: eventData.extractionConfidence.overall
      });

      console.log(`✅ Extracted event: ${eventData.events[0].title}`);
    } catch (error) {
      console.error(`❌ Failed to extract event data:`, error);
    }
  }
}
```

### 2. Event Data Extractor Integration
```javascript
class EventDataExtractor {
  constructor(claudeApiKey) {
    this.claudeApiKey = claudeApiKey;
    this.prompt = `# AI Prompt for Event Poster Data Extraction
    
    ## Task
    Extract all event information from this poster image and return it as structured JSON data.
    
    [... your full prompt here ...]`;
  }

  async extractFromImage(imageUrl) {
    // Download image and convert to base64
    const imageBuffer = await this.downloadImage(imageUrl);
    const base64Image = imageBuffer.toString('base64');

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.claudeApiKey
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Image,
              }
            },
            {
              type: "text",
              text: this.prompt
            }
          ]
        }]
      })
    });

    const data = await response.json();
    const responseText = data.content[0].text;
    
    // Clean and parse JSON response
    const cleanedResponse = responseText.replace(/```json\s?/g, "").replace(/```\s?/g, "").trim();
    return JSON.parse(cleanedResponse);
  }

  async downloadImage(url) {
    const response = await fetch(url);
    return Buffer.from(await response.arrayBuffer());
  }
}
```

### 3. Scheduling & Automation
```javascript
// Using node-cron for scheduling
const cron = require('node-cron');

class MonitoringScheduler {
  constructor(monitor) {
    this.monitor = monitor;
  }

  start() {
    // Check every 30 minutes during business hours
    cron.schedule('*/30 8-22 * * *', async () => {
      console.log('🔍 Starting scheduled Instagram monitoring...');
      await this.monitor.monitorClubs();
    });

    // Full sync once daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('🔄 Starting daily full sync...');
      await this.monitor.fullSync();
    });
  }
}
```

## 📋 CSV Club Management

### CSV Format
```csv
name,username,active,category,location
Prince George Arts Council,pgac_events,true,arts,prince-george
University of Northern BC,unbc_official,true,education,prince-george
Downtown BIA,downtownpg,true,business,prince-george
PG Sports Complex,pgsports,false,sports,prince-george
Two Rivers Gallery,tworiversart,true,arts,prince-george
```

### CSV Processing
```javascript
const csv = require('csv-parser');
const fs = require('fs');

class ClubManager {
  async loadClubsFromCSV(filePath) {
    const clubs = [];
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          clubs.push({
            name: row.name,
            username: row.username,
            active: row.active === 'true',
            category: row.category,
            location: row.location
          });
        })
        .on('end', () => {
          resolve(clubs);
        })
        .on('error', reject);
    });
  }

  async syncClubsToDatabase(clubs) {
    for (const club of clubs) {
      await this.db.upsertClub(club);
    }
  }
}
```

## 🚀 Deployment Options

### Option 1: Node.js Service
```bash
# Package structure
instagram-monitor/
├── src/
│   ├── services/
│   │   ├── instagram-client.js
│   │   ├── image-classifier.js
│   │   ├── event-extractor.js
│   │   └── database.js
│   ├── models/
│   ├── utils/
│   └── app.js
├── config/
├── data/
│   └── clubs.csv
└── package.json
```

### Option 2: Docker Container
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/app.js"]
```

### Option 3: Serverless (AWS Lambda)
```javascript
// lambda-handler.js
exports.handler = async (event) => {
  const monitor = new InstagramMonitor(process.env);
  
  if (event.source === 'aws.events') {
    // Scheduled monitoring
    await monitor.monitorClubs();
  } else {
    // Manual trigger or webhook
    await monitor.processSpecificClub(event.clubId);
  }
  
  return { statusCode: 200, body: 'Monitoring completed' };
};
```

## 💰 Cost Estimation

### API Costs (Monthly)
- **Data365 API**: $64-200/month (100-500k requests)
- **Google Vision API**: $1.50/1000 images
- **Claude API**: $15/1M tokens (~$50-100/month)
- **Hosting**: $20-50/month (VPS/container)

### Total: ~$150-400/month depending on volume

## 🔒 Compliance & Best Practices

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
```

### Error Handling & Logging
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

## 🎯 Integration with EventScrape

### Auto-Import to EventScrape
```javascript
class EventScrapeIntegration {
  async importExtractedEvents() {
    const unimportedEvents = await this.db.getUnimportedEvents();
    
    for (const event of unimportedEvents) {
      try {
        const eventData = JSON.parse(event.event_data_json);
        
        // Convert to EventScrape format
        const rawEvent = this.convertToRawEvent(eventData.events[0]);
        
        // Import via EventScrape API or database
        await this.eventScrapeApi.importEvent(rawEvent);
        
        // Mark as imported
        await this.db.markEventImported(event.id);
        
      } catch (error) {
        console.error(`Failed to import event ${event.id}:`, error);
      }
    }
  }

  convertToRawEvent(extractedEvent) {
    return {
      title: extractedEvent.title,
      description: extractedEvent.description,
      start_date: extractedEvent.startDate,
      start_time: extractedEvent.startTime,
      end_date: extractedEvent.endDate,
      end_time: extractedEvent.endTime,
      venue_name: extractedEvent.venue?.name,
      venue_address: extractedEvent.venue?.address,
      city: extractedEvent.venue?.city || 'Prince George',
      province: extractedEvent.venue?.region || 'BC',
      country: extractedEvent.venue?.country || 'Canada',
      price: extractedEvent.price,
      organizer: extractedEvent.organizer,
      category: extractedEvent.category,
      tags: extractedEvent.tags?.join(','),
      registration_url: extractedEvent.registrationUrl,
      contact_phone: extractedEvent.contactInfo?.phone,
      contact_email: extractedEvent.contactInfo?.email,
      contact_website: extractedEvent.contactInfo?.website,
      additional_info: extractedEvent.additionalInfo,
      source: 'instagram_poster_ai',
      confidence_score: extractedEvent.extractionConfidence?.overall
    };
  }
}
```

This system gives you a complete pipeline from Instagram monitoring to structured event data in EventScrape! 🎉