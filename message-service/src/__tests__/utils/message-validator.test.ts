/**
 * Unit Tests for Message Validator
 */

import { MessageValidator } from '../../utils/message-validator';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger');

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('MessageValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateMessage', () => {
    it('should validate a complete valid message', () => {
      // Arrange
      const validMessage = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: 'Hello, I need help with my order',
          format: 'text' as const,
        },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: {
          type: 'customer' as const,
          email: 'customer@example.com',
          name: 'John Doe',
        },
        metadata: {
          source: 'email',
          priority: 'normal',
        },
      };

      // Act
      const result = MessageValidator.validateMessage(validMessage);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject message with missing required fields', () => {
      // Arrange
      const invalidMessage = {
        // Missing organizationId
        conversationId: 'conv_456',
        content: {
          text: '', // Empty text
          format: 'text' as const,
        },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: {
          type: 'customer' as const,
        },
      };

      // Act
      const result = MessageValidator.validateMessage(invalidMessage as any);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('organizationId is required');
      expect(result.errors).toContain('content.text cannot be empty');
    });

    it('should validate different content formats', () => {
      // Arrange
      const htmlMessage = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: 'Hello',
          html: '<p>Hello</p>',
          format: 'html' as const,
        },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: {
          type: 'customer' as const,
        },
      };

      // Act
      const result = MessageValidator.validateMessage(htmlMessage);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate attachment content', () => {
      // Arrange
      const attachmentMessage = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: 'Please see attached file',
          format: 'text' as const,
          attachments: [
            {
              filename: 'document.pdf',
              mimeType: 'application/pdf',
              size: 1024000,
              url: 'https://example.com/file.pdf',
            },
          ],
        },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: {
          type: 'customer' as const,
        },
      };

      // Act
      const result = MessageValidator.validateMessage(attachmentMessage);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid attachment format', () => {
      // Arrange
      const invalidAttachmentMessage = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: 'File attached',
          format: 'text' as const,
          attachments: [
            {
              filename: '', // Empty filename
              mimeType: 'invalid/type',
              size: -1, // Invalid size
              // Missing url
            },
          ],
        },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: {
          type: 'customer' as const,
        },
      };

      // Act
      const result = MessageValidator.validateMessage(invalidAttachmentMessage as any);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('attachment filename cannot be empty');
      expect(result.errors).toContain('attachment size must be positive');
      expect(result.errors).toContain('attachment url is required');
    });

    it('should validate different sender types', () => {
      // Arrange
      const agentMessage = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: 'How can I help you?',
          format: 'text' as const,
        },
        direction: 'outbound' as const,
        channel: 'chat' as const,
        sender: {
          type: 'agent' as const,
          id: 'agent_123',
          name: 'Support Agent',
        },
      };

      // Act
      const result = MessageValidator.validateMessage(agentMessage);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate system messages', () => {
      // Arrange
      const systemMessage = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: 'Conversation started',
          format: 'text' as const,
        },
        direction: 'system' as const,
        channel: 'system' as const,
        sender: {
          type: 'system' as const,
        },
      };

      // Act
      const result = MessageValidator.validateMessage(systemMessage);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid enum values', () => {
      // Arrange
      const invalidEnumMessage = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: 'Hello',
          format: 'invalid_format' as any,
        },
        direction: 'invalid_direction' as any,
        channel: 'invalid_channel' as any,
        sender: {
          type: 'invalid_type' as any,
        },
      };

      // Act
      const result = MessageValidator.validateMessage(invalidEnumMessage);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('invalid content format');
      expect(result.errors).toContain('invalid direction');
      expect(result.errors).toContain('invalid channel');
      expect(result.errors).toContain('invalid sender type');
    });
  });

  describe('validateContent', () => {
    it('should validate text content', () => {
      // Arrange
      const textContent = {
        text: 'Hello world',
        format: 'text' as const,
      };

      // Act
      const result = MessageValidator.validateContent(textContent);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate HTML content', () => {
      // Arrange
      const htmlContent = {
        text: 'Hello world',
        html: '<p>Hello <strong>world</strong></p>',
        format: 'html' as const,
      };

      // Act
      const result = MessageValidator.validateContent(htmlContent);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty text content', () => {
      // Arrange
      const emptyContent = {
        text: '',
        format: 'text' as const,
      };

      // Act
      const result = MessageValidator.validateContent(emptyContent);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('content.text cannot be empty');
    });

    it('should validate content with attachments', () => {
      // Arrange
      const contentWithAttachments = {
        text: 'Please see attached',
        format: 'text' as const,
        attachments: [
          {
            filename: 'document.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            url: 'https://example.com/file.pdf',
          },
        ],
      };

      // Act
      const result = MessageValidator.validateContent(contentWithAttachments);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateSender', () => {
    it('should validate customer sender', () => {
      // Arrange
      const customerSender = {
        type: 'customer' as const,
        email: 'customer@example.com',
        name: 'John Doe',
        phone: '+1234567890',
      };

      // Act
      const result = MessageValidator.validateSender(customerSender);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate agent sender', () => {
      // Arrange
      const agentSender = {
        type: 'agent' as const,
        id: 'agent_123',
        name: 'Support Agent',
        email: 'agent@company.com',
      };

      // Act
      const result = MessageValidator.validateSender(agentSender);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate system sender', () => {
      // Arrange
      const systemSender = {
        type: 'system' as const,
      };

      // Act
      const result = MessageValidator.validateSender(systemSender);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid email format', () => {
      // Arrange
      const invalidEmailSender = {
        type: 'customer' as const,
        email: 'invalid-email',
        name: 'John Doe',
      };

      // Act
      const result = MessageValidator.validateSender(invalidEmailSender);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('invalid email format');
    });

    it('should reject missing required fields for agent', () => {
      // Arrange
      const incompleteAgentSender = {
        type: 'agent' as const,
        // Missing id and name
      };

      // Act
      const result = MessageValidator.validateSender(incompleteAgentSender as any);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('agent id is required');
      expect(result.errors).toContain('agent name is required');
    });
  });

  describe('validateMetadata', () => {
    it('should validate valid metadata', () => {
      // Arrange
      const validMetadata = {
        source: 'email',
        priority: 'high',
        tags: ['urgent', 'billing'],
        customFields: {
          orderId: 'ORD-123',
          customerTier: 'premium',
        },
      };

      // Act
      const result = MessageValidator.validateMetadata(validMetadata);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject metadata with invalid types', () => {
      // Arrange
      const invalidMetadata = {
        source: 123, // Should be string
        priority: 'invalid_priority',
        tags: 'not_an_array', // Should be array
      };

      // Act
      const result = MessageValidator.validateMetadata(invalidMetadata as any);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('source must be a string');
      expect(result.errors).toContain('invalid priority value');
      expect(result.errors).toContain('tags must be an array');
    });

    it('should handle empty metadata', () => {
      // Arrange
      const emptyMetadata = {};

      // Act
      const result = MessageValidator.validateMetadata(emptyMetadata);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('sanitizeMessage', () => {
    it('should sanitize HTML content', () => {
      // Arrange
      const messageWithUnsafeHTML = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: 'Hello',
          html: '<p>Hello <script>alert("xss")</script></p>',
          format: 'html' as const,
        },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: {
          type: 'customer' as const,
        },
      };

      // Act
      const sanitized = MessageValidator.sanitizeMessage(messageWithUnsafeHTML);

      // Assert
      expect(sanitized.content.html).not.toContain('<script>');
      expect(sanitized.content.html).toContain('<p>Hello </p>');
    });

    it('should trim whitespace from text content', () => {
      // Arrange
      const messageWithWhitespace = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: '  Hello world  ',
          format: 'text' as const,
        },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: {
          type: 'customer' as const,
          name: '  John Doe  ',
        },
      };

      // Act
      const sanitized = MessageValidator.sanitizeMessage(messageWithWhitespace);

      // Assert
      expect(sanitized.content.text).toBe('Hello world');
      expect(sanitized.sender.name).toBe('John Doe');
    });

    it('should normalize email addresses', () => {
      // Arrange
      const messageWithEmail = {
        organizationId: 'org_123',
        conversationId: 'conv_456',
        content: {
          text: 'Hello',
          format: 'text' as const,
        },
        direction: 'inbound' as const,
        channel: 'email' as const,
        sender: {
          type: 'customer' as const,
          email: 'CUSTOMER@EXAMPLE.COM',
        },
      };

      // Act
      const sanitized = MessageValidator.sanitizeMessage(messageWithEmail);

      // Assert
      expect(sanitized.sender.email).toBe('customer@example.com');
    });
  });
});
