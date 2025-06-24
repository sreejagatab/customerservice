/**
 * K6 Load Testing Script - Message Processing
 * Tests message processing performance under load
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const messageProcessingTime = new Trend('message_processing_time');
const messageSuccessRate = new Rate('message_success_rate');
const websocketConnections = new Counter('websocket_connections');
const aiResponseTime = new Trend('ai_response_time');

// Test configuration
export const options = {
  stages: [
    // Ramp up
    { duration: '2m', target: 100 },   // Ramp up to 100 users over 2 minutes
    { duration: '5m', target: 500 },   // Ramp up to 500 users over 5 minutes
    { duration: '10m', target: 1000 }, // Ramp up to 1000 users over 10 minutes
    
    // Sustained load
    { duration: '15m', target: 1000 }, // Stay at 1000 users for 15 minutes
    
    // Peak load
    { duration: '5m', target: 1500 },  // Peak at 1500 users for 5 minutes
    
    // Ramp down
    { duration: '5m', target: 500 },   // Ramp down to 500 users
    { duration: '2m', target: 0 },     // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.01'],   // Error rate must be below 1%
    message_processing_time: ['p(95)<2000'], // 95% of messages processed under 2s
    message_success_rate: ['rate>0.99'],     // 99% message success rate
    ai_response_time: ['p(95)<3000'],        // 95% of AI responses under 3s
  },
};

// Test data
const testMessages = [
  'Hello, I need help with my order',
  'Can you help me track my shipment?',
  'I want to return an item',
  'What are your business hours?',
  'I have a billing question',
  'How do I reset my password?',
  'I need technical support',
  'Can you help me with product information?',
];

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

// Authentication
function authenticate() {
  const loginPayload = {
    email: `testuser${Math.floor(Math.random() * 10000)}@example.com`,
    password: 'testpassword123',
  };

  const response = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify(loginPayload), {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  check(response, {
    'authentication successful': (r) => r.status === 200,
    'received auth token': (r) => r.json('token') !== undefined,
  });

  return response.json('token');
}

// Main test function
export default function () {
  const token = authenticate();
  
  if (!token) {
    console.error('Authentication failed');
    return;
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Test REST API message sending
  testRestMessageSending(headers);
  
  // Test WebSocket real-time messaging
  testWebSocketMessaging(token);
  
  // Test AI processing endpoints
  testAIProcessing(headers);
  
  // Test analytics endpoints
  testAnalyticsEndpoints(headers);

  sleep(1);
}

function testRestMessageSending(headers) {
  const conversationPayload = {
    customerId: `customer_${Math.floor(Math.random() * 1000)}`,
    channel: 'web',
    metadata: {
      userAgent: 'k6-load-test',
      source: 'load-testing',
    },
  };

  // Create conversation
  const conversationResponse = http.post(
    `${BASE_URL}/api/v1/conversations`,
    JSON.stringify(conversationPayload),
    { headers }
  );

  check(conversationResponse, {
    'conversation created': (r) => r.status === 201,
    'conversation has ID': (r) => r.json('data.id') !== undefined,
  });

  const conversationId = conversationResponse.json('data.id');
  
  if (!conversationId) {
    return;
  }

  // Send message
  const messagePayload = {
    content: testMessages[Math.floor(Math.random() * testMessages.length)],
    type: 'text',
    senderId: `customer_${Math.floor(Math.random() * 1000)}`,
  };

  const messageStart = Date.now();
  const messageResponse = http.post(
    `${BASE_URL}/api/v1/conversations/${conversationId}/messages`,
    JSON.stringify(messagePayload),
    { headers }
  );

  const messageProcessingDuration = Date.now() - messageStart;
  messageProcessingTime.add(messageProcessingDuration);

  const messageSuccess = check(messageResponse, {
    'message sent successfully': (r) => r.status === 201,
    'message has ID': (r) => r.json('data.id') !== undefined,
    'processing time acceptable': () => messageProcessingDuration < 5000,
  });

  messageSuccessRate.add(messageSuccess);
}

function testWebSocketMessaging(token) {
  const wsUrl = `${WS_URL}/ws?token=${token}`;
  
  const response = ws.connect(wsUrl, {}, function (socket) {
    websocketConnections.add(1);
    
    socket.on('open', () => {
      console.log('WebSocket connection established');
      
      // Send a test message
      const message = {
        type: 'message',
        conversationId: `conv_${Math.floor(Math.random() * 1000)}`,
        content: testMessages[Math.floor(Math.random() * testMessages.length)],
        timestamp: new Date().toISOString(),
      };
      
      socket.send(JSON.stringify(message));
    });

    socket.on('message', (data) => {
      const message = JSON.parse(data);
      
      check(message, {
        'received valid message': (m) => m.type !== undefined,
        'message has content': (m) => m.content !== undefined,
      });
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Keep connection open for a short time
    sleep(2);
  });

  check(response, {
    'websocket connection successful': (r) => r && r.status === 101,
  });
}

function testAIProcessing(headers) {
  const aiPayload = {
    message: testMessages[Math.floor(Math.random() * testMessages.length)],
    context: {
      conversationHistory: [],
      customerData: {
        id: `customer_${Math.floor(Math.random() * 1000)}`,
        tier: 'standard',
      },
    },
    options: {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
    },
  };

  const aiStart = Date.now();
  const aiResponse = http.post(
    `${BASE_URL}/api/v1/ai/generate-response`,
    JSON.stringify(aiPayload),
    { headers }
  );

  const aiProcessingDuration = Date.now() - aiStart;
  aiResponseTime.add(aiProcessingDuration);

  check(aiResponse, {
    'AI response generated': (r) => r.status === 200,
    'AI response has content': (r) => r.json('data.response') !== undefined,
    'AI response time acceptable': () => aiProcessingDuration < 10000,
  });
}

function testAnalyticsEndpoints(headers) {
  // Test dashboard overview
  const overviewResponse = http.get(
    `${BASE_URL}/api/v1/dashboard/overview?timeRange=1h`,
    { headers }
  );

  check(overviewResponse, {
    'analytics overview loaded': (r) => r.status === 200,
    'overview has metrics': (r) => r.json('data.totalMessages') !== undefined,
  });

  // Test real-time metrics
  const realtimeResponse = http.get(
    `${BASE_URL}/api/v1/dashboard/realtime`,
    { headers }
  );

  check(realtimeResponse, {
    'realtime metrics loaded': (r) => r.status === 200,
    'realtime has active conversations': (r) => r.json('data.activeConversations') !== undefined,
  });
}

// Setup function
export function setup() {
  console.log('Starting load test setup...');
  
  // Verify services are running
  const healthResponse = http.get(`${BASE_URL}/health`);
  
  if (healthResponse.status !== 200) {
    throw new Error('Services are not healthy');
  }
  
  console.log('All services are healthy, starting load test...');
  return { baseUrl: BASE_URL };
}

// Teardown function
export function teardown(data) {
  console.log('Load test completed');
  console.log(`Base URL: ${data.baseUrl}`);
  
  // Could add cleanup logic here if needed
}
