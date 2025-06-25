/**
 * Integration Tests for Message Flow
 * Tests complete message processing workflows across services
 */

import { MessageService } from '../../services/message-service';
import { MessageProcessor } from '../../services/message-processor';
import { NotificationService } from '../../../notification-service/src/services/notification-service';
import { AIService } from '../../../ai-service/src/services/ai-service';
import { redis } from '../../services/redis';
import { messageQueue } from '../../services/message-queue';

describe('Message Flow Integration', () => {
  let messageService: MessageService;
  let messageProcessor: MessageProcessor;
  let notificationService: NotificationService;
  let aiService: AIService;

  beforeAll(async () => {
    // Initialize services
    messageService = MessageService.getInstance();
    messageProcessor = MessageProcessor.getInstance();
    notificationService = NotificationService.getInstance();
    aiService = AIService.getInstance();

    // Setup test database and Redis
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await redis.flushdb();
    await messageQueue.purge();
  });

  describe('Inbound Message Processing', () => {
    it('should process inbound email message end-to-end', async () => {
      // Arrange
      const testOrganization = global.testUtils.generateTestOrganization();
      const testUser = global.testUtils.generateTestUser();
      
      const inboundMessage = {
        organizationId: testOrganization.id,
        conversationId: `conv_${Date.now()}`,
        content: 'Hello, I need help with my account',
        type: 'text' as const,
        direction: 'inbound' as const,
        channel: 'email' as const,
        metadata: {
          from: 'customer@example.com',
          to: 'support@company.com',
          subject: 'Account Help Request',
          messageId: `email_${Date.now()}`,
        },
      };

      // Act
      const message = await messageService.createMessage(inboundMessage, testUser.id);
      
      // Wait for processing to complete
      await global.testUtils.waitFor(2000);
      
      // Assert - Message should be processed
      const processedMessage = await messageService.getMessage(message.id);
      expect(processedMessage).toBeTruthy();
      expect(processedMessage!.status).toBe('processed');
      
      // Assert - AI analysis should be completed
      const aiAnalysis = await aiService.getMessageAnalysis(message.id);
      expect(aiAnalysis).toBeTruthy();
      expect(aiAnalysis.sentiment).toBeDefined();
      expect(aiAnalysis.intent).toBeDefined();
      expect(aiAnalysis.entities).toBeDefined();
      
      // Assert - Conversation should be created/updated
      const conversation = await messageService.getConversation(inboundMessage.conversationId);
      expect(conversation).toBeTruthy();
      expect(conversation.messageCount).toBe(1);
      expect(conversation.lastMessageAt).toBeWithinTimeRange(new Date());
      
      // Assert - Notification should be sent to agents
      const notifications = await notificationService.getNotifications({
        organizationId: testOrganization.id,
        type: 'new_message',
      });
      expect(notifications.length).toBeGreaterThan(0);
    });

    it('should handle high-priority urgent messages', async () => {
      // Arrange
      const urgentMessage = {
        organizationId: global.testUtils.generateTestOrganization().id,
        conversationId: `conv_urgent_${Date.now()}`,
        content: 'URGENT: System is down, need immediate help!',
        type: 'text' as const,
        direction: 'inbound' as const,
        channel: 'chat' as const,
        metadata: {
          priority: 'urgent',
          escalate: true,
        },
      };

      // Act
      const message = await messageService.createMessage(urgentMessage, 'user_123');
      await global.testUtils.waitFor(1000);

      // Assert - Message should be prioritized
      const processedMessage = await messageService.getMessage(message.id);
      expect(processedMessage!.priority).toBe('urgent');
      
      // Assert - Should trigger immediate escalation
      const escalations = await notificationService.getNotifications({
        organizationId: urgentMessage.organizationId,
        type: 'escalation',
      });
      expect(escalations.length).toBeGreaterThan(0);
      expect(escalations[0].priority).toBe('urgent');
    });

    it('should process messages with attachments', async () => {
      // Arrange
      const messageWithAttachment = {
        organizationId: global.testUtils.generateTestOrganization().id,
        conversationId: `conv_attachment_${Date.now()}`,
        content: 'Please see attached screenshot of the error',
        type: 'text' as const,
        direction: 'inbound' as const,
        channel: 'email' as const,
        attachments: [
          {
            id: `att_${Date.now()}`,
            name: 'error_screenshot.png',
            type: 'image/png',
            size: 1024000,
            url: 'https://storage.example.com/attachments/error_screenshot.png',
          },
        ],
      };

      // Act
      const message = await messageService.createMessage(messageWithAttachment, 'user_123');
      await global.testUtils.waitFor(2000);

      // Assert - Attachments should be processed
      const processedMessage = await messageService.getMessage(message.id);
      expect(processedMessage!.attachments).toHaveLength(1);
      expect(processedMessage!.attachments![0].processed).toBeTruthy();
      
      // Assert - Image analysis should be performed
      const imageAnalysis = await aiService.getImageAnalysis(processedMessage!.attachments![0].id);
      expect(imageAnalysis).toBeTruthy();
      expect(imageAnalysis.description).toBeDefined();
      expect(imageAnalysis.tags).toBeDefined();
    });
  });

  describe('Outbound Message Processing', () => {
    it('should send outbound email message successfully', async () => {
      // Arrange
      const testOrganization = global.testUtils.generateTestOrganization();
      const outboundMessage = {
        organizationId: testOrganization.id,
        conversationId: `conv_${Date.now()}`,
        content: 'Thank you for contacting us. We will help you resolve this issue.',
        type: 'text' as const,
        direction: 'outbound' as const,
        channel: 'email' as const,
        metadata: {
          to: 'customer@example.com',
          from: 'support@company.com',
          subject: 'Re: Account Help Request',
          template: 'support_response',
        },
      };

      // Act
      const message = await messageService.createMessage(outboundMessage, 'agent_123');
      await global.testUtils.waitFor(3000);

      // Assert - Message should be sent
      const sentMessage = await messageService.getMessage(message.id);
      expect(sentMessage!.status).toBe('delivered');
      expect(sentMessage!.deliveredAt).toBeDefined();
      
      // Assert - Delivery tracking should be recorded
      const deliveryStatus = await messageService.getDeliveryStatus(message.id);
      expect(deliveryStatus.status).toBe('delivered');
      expect(deliveryStatus.attempts).toBeGreaterThan(0);
      expect(deliveryStatus.lastAttempt).toBeWithinTimeRange(new Date());
    });

    it('should handle message delivery failures with retry', async () => {
      // Arrange - Mock email service to fail initially
      const failingMessage = {
        organizationId: global.testUtils.generateTestOrganization().id,
        conversationId: `conv_${Date.now()}`,
        content: 'Test message that will fail delivery',
        type: 'text' as const,
        direction: 'outbound' as const,
        channel: 'email' as const,
        metadata: {
          to: 'invalid@nonexistent-domain.com',
          from: 'support@company.com',
        },
      };

      // Mock email service to fail first attempts
      jest.spyOn(messageProcessor as any, 'sendEmail')
        .mockRejectedValueOnce(new Error('SMTP connection failed'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ messageId: 'email_123', status: 'sent' });

      // Act
      const message = await messageService.createMessage(failingMessage, 'agent_123');
      await global.testUtils.waitFor(5000); // Wait for retries

      // Assert - Should eventually succeed after retries
      const finalMessage = await messageService.getMessage(message.id);
      expect(finalMessage!.status).toBe('delivered');
      
      // Assert - Retry attempts should be logged
      const deliveryStatus = await messageService.getDeliveryStatus(message.id);
      expect(deliveryStatus.attempts).toBe(3);
      expect(deliveryStatus.errors).toHaveLength(2);
    });
  });

  describe('AI-Powered Message Processing', () => {
    it('should generate automatic responses for common queries', async () => {
      // Arrange
      const commonQuery = {
        organizationId: global.testUtils.generateTestOrganization().id,
        conversationId: `conv_${Date.now()}`,
        content: 'What are your business hours?',
        type: 'text' as const,
        direction: 'inbound' as const,
        channel: 'chat' as const,
      };

      // Act
      const message = await messageService.createMessage(commonQuery, 'user_123');
      await global.testUtils.waitFor(3000);

      // Assert - AI should generate automatic response
      const conversation = await messageService.getConversation(commonQuery.conversationId);
      expect(conversation.messageCount).toBe(2); // Original + AI response
      
      const messages = await messageService.getConversationMessages(commonQuery.conversationId);
      const aiResponse = messages.find(m => m.direction === 'outbound' && m.metadata?.automated);
      
      expect(aiResponse).toBeTruthy();
      expect(aiResponse!.content).toContain('business hours');
      expect(aiResponse!.metadata?.confidence).toBeGreaterThan(0.8);
    });

    it('should escalate complex queries to human agents', async () => {
      // Arrange
      const complexQuery = {
        organizationId: global.testUtils.generateTestOrganization().id,
        conversationId: `conv_${Date.now()}`,
        content: 'I have a complex billing issue with multiple accounts and need to discuss payment arrangements',
        type: 'text' as const,
        direction: 'inbound' as const,
        channel: 'email' as const,
      };

      // Act
      const message = await messageService.createMessage(complexQuery, 'user_123');
      await global.testUtils.waitFor(2000);

      // Assert - Should be escalated to human agent
      const processedMessage = await messageService.getMessage(message.id);
      expect(processedMessage!.metadata?.escalated).toBeTruthy();
      expect(processedMessage!.metadata?.escalationReason).toBe('complex_query');
      
      // Assert - Agent should be notified
      const notifications = await notificationService.getNotifications({
        organizationId: complexQuery.organizationId,
        type: 'escalation',
      });
      expect(notifications.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Channel Message Synchronization', () => {
    it('should synchronize messages across multiple channels', async () => {
      // Arrange
      const conversationId = `conv_multichannel_${Date.now()}`;
      const organizationId = global.testUtils.generateTestOrganization().id;

      const emailMessage = {
        organizationId,
        conversationId,
        content: 'Initial email inquiry',
        type: 'text' as const,
        direction: 'inbound' as const,
        channel: 'email' as const,
      };

      const chatMessage = {
        organizationId,
        conversationId,
        content: 'Follow-up via chat',
        type: 'text' as const,
        direction: 'inbound' as const,
        channel: 'chat' as const,
      };

      // Act
      const email = await messageService.createMessage(emailMessage, 'user_123');
      await global.testUtils.waitFor(1000);
      
      const chat = await messageService.createMessage(chatMessage, 'user_123');
      await global.testUtils.waitFor(1000);

      // Assert - Both messages should be in same conversation
      const conversation = await messageService.getConversation(conversationId);
      expect(conversation.messageCount).toBe(2);
      expect(conversation.channels).toContain('email');
      expect(conversation.channels).toContain('chat');
      
      // Assert - Messages should be properly ordered
      const messages = await messageService.getConversationMessages(conversationId);
      expect(messages).toHaveLength(2);
      expect(messages[0].createdAt.getTime()).toBeLessThan(messages[1].createdAt.getTime());
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high message volume efficiently', async () => {
      // Arrange
      const messageCount = 50;
      const organizationId = global.testUtils.generateTestOrganization().id;
      
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        organizationId,
        conversationId: `conv_load_test_${i}`,
        content: `Load test message ${i}`,
        type: 'text' as const,
        direction: 'inbound' as const,
        channel: 'email' as const,
      }));

      const startTime = Date.now();

      // Act
      const results = await Promise.all(
        messages.map(msg => messageService.createMessage(msg, 'user_123'))
      );

      const creationTime = Date.now() - startTime;

      // Wait for all messages to be processed
      await global.testUtils.waitFor(5000);

      // Assert - All messages should be created successfully
      expect(results).toHaveLength(messageCount);
      expect(results.every(r => r.id)).toBeTruthy();
      
      // Assert - Creation should be reasonably fast
      expect(creationTime).toBeLessThan(10000); // Less than 10 seconds
      
      // Assert - All messages should be processed
      const processedCount = await Promise.all(
        results.map(async (msg) => {
          const processed = await messageService.getMessage(msg.id);
          return processed?.status === 'processed' ? 1 : 0;
        })
      );
      
      expect(processedCount.reduce((a, b) => a + b, 0)).toBe(messageCount);
    });
  });

  // Helper functions
  async function setupTestEnvironment() {
    // Setup test database connections
    // Setup test Redis instance
    // Setup test message queues
    // Initialize test data
  }

  async function cleanupTestEnvironment() {
    // Clean up test database
    // Clean up test Redis
    // Clean up test queues
    // Remove test files
  }
});
