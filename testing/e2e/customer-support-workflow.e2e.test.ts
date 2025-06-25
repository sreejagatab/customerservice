/**
 * End-to-End Tests for Customer Support Workflow
 * Tests complete user journeys from customer inquiry to resolution
 */

import { test, expect, Page, Browser } from '@playwright/test';
import { APIRequestContext } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL || 'http://localhost:8000';

// Test data
const testOrganization = {
  name: 'E2E Test Company',
  email: 'admin@e2etest.com',
  domain: 'e2etest.com',
};

const testAgent = {
  email: 'agent@e2etest.com',
  password: 'TestPassword123!',
  firstName: 'Test',
  lastName: 'Agent',
  role: 'agent',
};

const testCustomer = {
  email: 'customer@example.com',
  firstName: 'Test',
  lastName: 'Customer',
};

test.describe('Customer Support Workflow E2E', () => {
  let browser: Browser;
  let adminPage: Page;
  let agentPage: Page;
  let customerPage: Page;
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    // Launch browser and create contexts
    browser = await playwright.chromium.launch();
    
    // Create API context for setup
    apiContext = await playwright.request.newContext({
      baseURL: API_URL,
    });

    // Setup test organization and users
    await setupTestEnvironment();
  });

  test.afterAll(async () => {
    await cleanupTestEnvironment();
    await browser.close();
  });

  test.beforeEach(async () => {
    // Create fresh pages for each test
    adminPage = await browser.newPage();
    agentPage = await browser.newPage();
    customerPage = await browser.newPage();
  });

  test.afterEach(async () => {
    await adminPage.close();
    await agentPage.close();
    await customerPage.close();
  });

  test('Complete customer support ticket lifecycle', async () => {
    // Step 1: Customer submits support request via web form
    await test.step('Customer submits support request', async () => {
      await customerPage.goto(`${BASE_URL}/support`);
      
      // Fill out support form
      await customerPage.fill('[data-testid="customer-email"]', testCustomer.email);
      await customerPage.fill('[data-testid="customer-name"]', `${testCustomer.firstName} ${testCustomer.lastName}`);
      await customerPage.fill('[data-testid="subject"]', 'Unable to access my account');
      await customerPage.fill('[data-testid="message"]', 'I am having trouble logging into my account. I keep getting an error message saying my credentials are invalid, but I am sure they are correct.');
      await customerPage.selectOption('[data-testid="category"]', 'account_access');
      await customerPage.selectOption('[data-testid="priority"]', 'medium');
      
      // Submit form
      await customerPage.click('[data-testid="submit-request"]');
      
      // Verify submission success
      await expect(customerPage.locator('[data-testid="success-message"]')).toBeVisible();
      await expect(customerPage.locator('[data-testid="ticket-number"]')).toBeVisible();
      
      // Store ticket number for later use
      const ticketNumber = await customerPage.locator('[data-testid="ticket-number"]').textContent();
      test.info().annotations.push({ type: 'ticket-number', description: ticketNumber || '' });
    });

    // Step 2: Agent receives notification and views ticket
    await test.step('Agent receives and views ticket', async () => {
      // Agent logs in
      await agentPage.goto(`${BASE_URL}/login`);
      await agentPage.fill('[data-testid="email"]', testAgent.email);
      await agentPage.fill('[data-testid="password"]', testAgent.password);
      await agentPage.click('[data-testid="login-button"]');
      
      // Verify login success
      await expect(agentPage.locator('[data-testid="dashboard"]')).toBeVisible();
      
      // Check for new ticket notification
      await expect(agentPage.locator('[data-testid="notification-badge"]')).toBeVisible();
      await agentPage.click('[data-testid="notifications"]');
      
      // Verify new ticket notification
      await expect(agentPage.locator('[data-testid="new-ticket-notification"]')).toBeVisible();
      
      // Navigate to tickets queue
      await agentPage.click('[data-testid="tickets-queue"]');
      await expect(agentPage.locator('[data-testid="tickets-list"]')).toBeVisible();
      
      // Find and open the new ticket
      const ticketRow = agentPage.locator('[data-testid="ticket-row"]').first();
      await expect(ticketRow).toBeVisible();
      await ticketRow.click();
      
      // Verify ticket details
      await expect(agentPage.locator('[data-testid="ticket-details"]')).toBeVisible();
      await expect(agentPage.locator('[data-testid="customer-email"]')).toContainText(testCustomer.email);
      await expect(agentPage.locator('[data-testid="ticket-subject"]')).toContainText('Unable to access my account');
    });

    // Step 3: AI suggests response and agent reviews
    await test.step('AI suggests response and agent reviews', async () => {
      // Wait for AI analysis to complete
      await agentPage.waitForSelector('[data-testid="ai-suggestions"]', { timeout: 10000 });
      
      // Verify AI suggestions are displayed
      await expect(agentPage.locator('[data-testid="ai-suggestions"]')).toBeVisible();
      await expect(agentPage.locator('[data-testid="suggested-response"]')).toBeVisible();
      await expect(agentPage.locator('[data-testid="confidence-score"]')).toBeVisible();
      
      // Check confidence score is reasonable
      const confidenceText = await agentPage.locator('[data-testid="confidence-score"]').textContent();
      const confidence = parseFloat(confidenceText?.replace('%', '') || '0');
      expect(confidence).toBeGreaterThan(70);
      
      // Verify suggested actions
      await expect(agentPage.locator('[data-testid="suggested-actions"]')).toBeVisible();
      await expect(agentPage.locator('[data-testid="action-reset-password"]')).toBeVisible();
      await expect(agentPage.locator('[data-testid="action-check-account-status"]')).toBeVisible();
    });

    // Step 4: Agent responds to customer
    await test.step('Agent responds to customer', async () => {
      // Use AI suggested response as starting point
      await agentPage.click('[data-testid="use-suggested-response"]');
      
      // Verify response is populated
      const responseText = await agentPage.locator('[data-testid="response-editor"]').inputValue();
      expect(responseText.length).toBeGreaterThan(50);
      
      // Agent customizes the response
      await agentPage.fill('[data-testid="response-editor"]', 
        `Hi ${testCustomer.firstName},\n\nThank you for contacting us about the login issue. I understand how frustrating this can be.\n\nI've checked your account and everything appears to be in order. Let's try a password reset to resolve this issue:\n\n1. Go to our login page\n2. Click "Forgot Password"\n3. Enter your email address\n4. Check your email for reset instructions\n\nIf you continue to have issues after resetting your password, please let me know and I'll investigate further.\n\nBest regards,\n${testAgent.firstName}`
      );
      
      // Set ticket status
      await agentPage.selectOption('[data-testid="ticket-status"]', 'pending_customer');
      
      // Send response
      await agentPage.click('[data-testid="send-response"]');
      
      // Verify response sent
      await expect(agentPage.locator('[data-testid="response-sent-confirmation"]')).toBeVisible();
      
      // Verify ticket status updated
      await expect(agentPage.locator('[data-testid="current-status"]')).toContainText('Pending Customer');
    });

    // Step 5: Customer receives email notification
    await test.step('Customer receives email notification', async () => {
      // In a real test, we would check email delivery
      // For this demo, we'll verify the notification was queued
      
      const response = await apiContext.get('/api/v1/notifications', {
        params: {
          type: 'ticket_response',
          recipient: testCustomer.email,
        },
      });
      
      expect(response.ok()).toBeTruthy();
      const notifications = await response.json();
      expect(notifications.data.length).toBeGreaterThan(0);
      
      const notification = notifications.data[0];
      expect(notification.status).toBe('sent');
      expect(notification.channel).toBe('email');
    });

    // Step 6: Customer follows up via chat
    await test.step('Customer follows up via chat', async () => {
      // Customer opens chat widget
      await customerPage.goto(`${BASE_URL}/support`);
      await customerPage.click('[data-testid="chat-widget"]');
      
      // Wait for chat to load
      await expect(customerPage.locator('[data-testid="chat-window"]')).toBeVisible();
      
      // Customer sends follow-up message
      await customerPage.fill('[data-testid="chat-input"]', 'I tried the password reset but I\'m still having issues. The reset email never arrived.');
      await customerPage.click('[data-testid="send-chat-message"]');
      
      // Verify message sent
      await expect(customerPage.locator('[data-testid="chat-message"]').last()).toContainText('I tried the password reset');
    });

    // Step 7: Agent receives chat notification and responds
    await test.step('Agent receives chat notification and responds', async () => {
      // Agent should receive real-time notification
      await expect(agentPage.locator('[data-testid="chat-notification"]')).toBeVisible({ timeout: 5000 });
      
      // Agent opens chat
      await agentPage.click('[data-testid="chat-notification"]');
      await expect(agentPage.locator('[data-testid="chat-panel"]')).toBeVisible();
      
      // Verify customer message is displayed
      await expect(agentPage.locator('[data-testid="customer-chat-message"]')).toContainText('reset email never arrived');
      
      // Agent responds via chat
      await agentPage.fill('[data-testid="agent-chat-input"]', 'I see the issue. Let me check your email settings and resend the reset link to a different email if needed. Can you provide an alternative email address?');
      await agentPage.click('[data-testid="send-agent-message"]');
      
      // Verify message sent
      await expect(agentPage.locator('[data-testid="agent-chat-message"]').last()).toContainText('alternative email address');
    });

    // Step 8: Resolution and ticket closure
    await test.step('Resolution and ticket closure', async () => {
      // Customer provides alternative email via chat
      await customerPage.fill('[data-testid="chat-input"]', 'Yes, you can try customer.alt@example.com');
      await customerPage.click('[data-testid="send-chat-message"]');
      
      // Agent processes the resolution
      await agentPage.fill('[data-testid="agent-chat-input"]', 'Perfect! I\'ve sent the password reset to customer.alt@example.com. You should receive it within a few minutes. Please try logging in after resetting your password and let me know if you need any further assistance.');
      await agentPage.click('[data-testid="send-agent-message"]');
      
      // Agent updates ticket with resolution
      await agentPage.click('[data-testid="add-internal-note"]');
      await agentPage.fill('[data-testid="internal-note"]', 'Customer provided alternative email address. Password reset sent to customer.alt@example.com. Issue should be resolved.');
      
      // Agent marks ticket as resolved
      await agentPage.selectOption('[data-testid="ticket-status"]', 'resolved');
      await agentPage.click('[data-testid="update-ticket"]');
      
      // Verify ticket status updated
      await expect(agentPage.locator('[data-testid="current-status"]')).toContainText('Resolved');
      
      // Customer confirms resolution
      await customerPage.fill('[data-testid="chat-input"]', 'Thank you! I was able to reset my password and log in successfully.');
      await customerPage.click('[data-testid="send-chat-message"]');
      
      // Agent closes ticket
      await agentPage.selectOption('[data-testid="ticket-status"]', 'closed');
      await agentPage.click('[data-testid="update-ticket"]');
      
      // Verify final status
      await expect(agentPage.locator('[data-testid="current-status"]')).toContainText('Closed');
    });

    // Step 9: Verify analytics and reporting
    await test.step('Verify analytics and reporting', async () => {
      // Navigate to analytics dashboard
      await agentPage.click('[data-testid="analytics-menu"]');
      await expect(agentPage.locator('[data-testid="analytics-dashboard"]')).toBeVisible();
      
      // Verify ticket metrics are updated
      await expect(agentPage.locator('[data-testid="tickets-resolved-today"]')).toContainText('1');
      await expect(agentPage.locator('[data-testid="average-resolution-time"]')).toBeVisible();
      
      // Check customer satisfaction
      await agentPage.click('[data-testid="satisfaction-metrics"]');
      await expect(agentPage.locator('[data-testid="satisfaction-score"]')).toBeVisible();
    });
  });

  test('Multi-channel conversation continuity', async () => {
    await test.step('Customer starts conversation via email', async () => {
      // Send email via API (simulating email integration)
      const emailResponse = await apiContext.post('/api/v1/messages', {
        data: {
          channel: 'email',
          direction: 'inbound',
          from: testCustomer.email,
          to: 'support@e2etest.com',
          subject: 'Billing question',
          content: 'I have a question about my recent invoice.',
          organizationId: 'test-org-id',
        },
      });
      
      expect(emailResponse.ok()).toBeTruthy();
      const emailMessage = await emailResponse.json();
      
      // Store conversation ID
      test.info().annotations.push({ 
        type: 'conversation-id', 
        description: emailMessage.data.conversationId 
      });
    });

    await test.step('Agent responds via email', async () => {
      // Agent logs in and responds
      await agentPage.goto(`${BASE_URL}/login`);
      await agentPage.fill('[data-testid="email"]', testAgent.email);
      await agentPage.fill('[data-testid="password"]', testAgent.password);
      await agentPage.click('[data-testid="login-button"]');
      
      // Find and respond to email
      await agentPage.click('[data-testid="tickets-queue"]');
      await agentPage.click('[data-testid="ticket-row"]');
      
      await agentPage.fill('[data-testid="response-editor"]', 'I\'d be happy to help with your billing question. Could you please provide more details about which invoice you\'re referring to?');
      await agentPage.click('[data-testid="send-response"]');
    });

    await test.step('Customer continues via chat', async () => {
      // Customer opens chat with same email
      await customerPage.goto(`${BASE_URL}/support`);
      await customerPage.click('[data-testid="chat-widget"]');
      
      // Provide email to link conversation
      await customerPage.fill('[data-testid="chat-email"]', testCustomer.email);
      await customerPage.click('[data-testid="start-chat"]');
      
      // Send follow-up message
      await customerPage.fill('[data-testid="chat-input"]', 'This is regarding invoice #12345 from last month. The amount seems incorrect.');
      await customerPage.click('[data-testid="send-chat-message"]');
      
      // Verify conversation history is shown
      await expect(customerPage.locator('[data-testid="conversation-history"]')).toBeVisible();
      await expect(customerPage.locator('[data-testid="previous-messages"]')).toContainText('billing question');
    });

    await test.step('Agent sees unified conversation', async () => {
      // Agent should see chat notification linked to existing ticket
      await expect(agentPage.locator('[data-testid="chat-notification"]')).toBeVisible();
      await agentPage.click('[data-testid="chat-notification"]');
      
      // Verify unified conversation view
      await expect(agentPage.locator('[data-testid="conversation-timeline"]')).toBeVisible();
      await expect(agentPage.locator('[data-testid="email-message"]')).toBeVisible();
      await expect(agentPage.locator('[data-testid="chat-message"]')).toBeVisible();
      
      // Verify conversation shows multiple channels
      await expect(agentPage.locator('[data-testid="channel-indicators"]')).toContainText('Email');
      await expect(agentPage.locator('[data-testid="channel-indicators"]')).toContainText('Chat');
    });
  });

  // Helper functions
  async function setupTestEnvironment() {
    // Create test organization
    const orgResponse = await apiContext.post('/api/v1/organizations', {
      data: testOrganization,
    });
    expect(orgResponse.ok()).toBeTruthy();
    
    // Create test agent
    const agentResponse = await apiContext.post('/api/v1/users', {
      data: {
        ...testAgent,
        organizationId: 'test-org-id',
      },
    });
    expect(agentResponse.ok()).toBeTruthy();
    
    // Setup test data and configurations
    await apiContext.post('/api/v1/settings', {
      data: {
        organizationId: 'test-org-id',
        aiEnabled: true,
        autoResponseEnabled: true,
        chatEnabled: true,
        emailEnabled: true,
      },
    });
  }

  async function cleanupTestEnvironment() {
    // Clean up test data
    await apiContext.delete('/api/v1/organizations/test-org-id');
  }
});

// Performance tests
test.describe('Performance Tests', () => {
  test('Dashboard loads within performance budget', async ({ page }) => {
    // Start performance monitoring
    await page.goto(`${BASE_URL}/login`);
    
    // Login
    await page.fill('[data-testid="email"]', testAgent.email);
    await page.fill('[data-testid="password"]', testAgent.password);
    
    const startTime = Date.now();
    await page.click('[data-testid="login-button"]');
    
    // Wait for dashboard to load
    await page.waitForSelector('[data-testid="dashboard"]');
    const loadTime = Date.now() - startTime;
    
    // Assert performance budget
    expect(loadTime).toBeLessThan(3000); // 3 seconds
    
    // Check for performance metrics
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
      };
    });
    
    expect(performanceMetrics.domContentLoaded).toBeLessThan(1500);
    expect(performanceMetrics.firstContentfulPaint).toBeLessThan(2000);
  });

  test('Chat widget responds quickly', async ({ page }) => {
    await page.goto(`${BASE_URL}/support`);
    
    const startTime = Date.now();
    await page.click('[data-testid="chat-widget"]');
    await page.waitForSelector('[data-testid="chat-window"]');
    const responseTime = Date.now() - startTime;
    
    expect(responseTime).toBeLessThan(1000); // 1 second
  });
});
