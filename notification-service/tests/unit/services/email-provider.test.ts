/**
 * Unit Tests for Email Provider Service
 */

import { SMTPEmailProvider, SendGridEmailProvider, EmailService } from '../../../src/providers/email-provider';
import { config } from '../../../src/config';

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(() => ({
    sendMail: jest.fn(),
    verify: jest.fn(),
  })),
}));

// Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

describe('Email Provider Service', () => {
  describe('SMTPEmailProvider', () => {
    let smtpProvider: SMTPEmailProvider;
    let mockTransporter: any;

    beforeEach(() => {
      const nodemailer = require('nodemailer');
      mockTransporter = {
        sendMail: jest.fn(),
        verify: jest.fn(),
      };
      nodemailer.createTransporter.mockReturnValue(mockTransporter);
      smtpProvider = new SMTPEmailProvider();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should send email successfully via SMTP', async () => {
      // Arrange
      const mockResult = { messageId: 'test-message-id' };
      mockTransporter.sendMail.mockResolvedValue(mockResult);

      const message = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
        html: '<p>Test content</p>',
      };

      // Act
      const result = await smtpProvider.send(message);

      // Assert
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
      expect(result.provider).toBe('smtp');
      expect(result.deliveryTime).toBeGreaterThan(0);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: `${config.email.smtp.fromName} <${config.email.smtp.fromEmail}>`,
          to: 'test@example.com',
          subject: 'Test Subject',
          text: 'Test content',
          html: '<p>Test content</p>',
        })
      );
    });

    it('should handle SMTP send failure', async () => {
      // Arrange
      const error = new Error('SMTP connection failed');
      mockTransporter.sendMail.mockRejectedValue(error);

      const message = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
      };

      // Act
      const result = await smtpProvider.send(message);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('SMTP connection failed');
      expect(result.provider).toBe('smtp');
      expect(result.deliveryTime).toBeGreaterThan(0);
    });

    it('should handle multiple recipients', async () => {
      // Arrange
      const mockResult = { messageId: 'test-message-id' };
      mockTransporter.sendMail.mockResolvedValue(mockResult);

      const message = {
        to: ['test1@example.com', 'test2@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Test Subject',
        text: 'Test content',
      };

      // Act
      const result = await smtpProvider.send(message);

      // Assert
      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test1@example.com, test2@example.com',
          cc: 'cc@example.com',
          bcc: 'bcc@example.com',
        })
      );
    });

    it('should handle attachments', async () => {
      // Arrange
      const mockResult = { messageId: 'test-message-id' };
      mockTransporter.sendMail.mockResolvedValue(mockResult);

      const message = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
        attachments: [
          {
            filename: 'test.pdf',
            content: Buffer.from('test content'),
            contentType: 'application/pdf',
          },
        ],
      };

      // Act
      const result = await smtpProvider.send(message);

      // Assert
      expect(result.success).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: message.attachments,
        })
      );
    });

    it('should perform health check successfully', async () => {
      // Arrange
      mockTransporter.verify.mockResolvedValue(true);

      // Act
      const result = await smtpProvider.healthCheck();

      // Assert
      expect(result).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should handle health check failure', async () => {
      // Arrange
      mockTransporter.verify.mockRejectedValue(new Error('Connection failed'));

      // Act
      const result = await smtpProvider.healthCheck();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('SendGridEmailProvider', () => {
    let sendGridProvider: SendGridEmailProvider;
    let mockSendGrid: any;

    beforeEach(() => {
      // Mock config
      (config as any).email.sendgrid.apiKey = 'SG.test-api-key';
      (config as any).email.sendgrid.fromEmail = 'test@sendgrid.com';

      mockSendGrid = {
        setApiKey: jest.fn(),
        send: jest.fn(),
      };

      jest.doMock('@sendgrid/mail', () => mockSendGrid);
      sendGridProvider = new SendGridEmailProvider();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should send email successfully via SendGrid', async () => {
      // Arrange
      const mockResult = [{ headers: { 'x-message-id': 'sg-message-id' } }];
      mockSendGrid.send.mockResolvedValue(mockResult);

      const message = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
        html: '<p>Test content</p>',
      };

      // Act
      const result = await sendGridProvider.send(message);

      // Assert
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('sg-message-id');
      expect(result.provider).toBe('sendgrid');
      expect(mockSendGrid.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: config.email.sendgrid.fromEmail,
          to: 'test@example.com',
          subject: 'Test Subject',
          text: 'Test content',
          html: '<p>Test content</p>',
        })
      );
    });

    it('should handle SendGrid send failure', async () => {
      // Arrange
      const error = new Error('SendGrid API error');
      mockSendGrid.send.mockRejectedValue(error);

      const message = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
      };

      // Act
      const result = await sendGridProvider.send(message);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('SendGrid API error');
      expect(result.provider).toBe('sendgrid');
    });

    it('should handle attachments with SendGrid', async () => {
      // Arrange
      const mockResult = [{ headers: { 'x-message-id': 'sg-message-id' } }];
      mockSendGrid.send.mockResolvedValue(mockResult);

      const message = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
        attachments: [
          {
            filename: 'test.pdf',
            content: Buffer.from('test content'),
            contentType: 'application/pdf',
          },
        ],
      };

      // Act
      const result = await sendGridProvider.send(message);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSendGrid.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: 'test.pdf',
              content: expect.any(String), // Base64 encoded
              type: 'application/pdf',
            }),
          ]),
        })
      );
    });

    it('should perform health check', async () => {
      // Act
      const result = await sendGridProvider.healthCheck();

      // Assert
      expect(result).toBe(true); // Should return true for valid API key format
    });
  });

  describe('EmailService', () => {
    let emailService: EmailService;

    beforeEach(() => {
      emailService = EmailService.getInstance();
    });

    it('should use primary provider for sending', async () => {
      // Arrange
      const mockProvider = {
        name: 'test-provider',
        send: jest.fn().mockResolvedValue({
          success: true,
          messageId: 'test-id',
          provider: 'test-provider',
          deliveryTime: 100,
        }),
        healthCheck: jest.fn().mockResolvedValue(true),
      };

      // Mock the providers array
      (emailService as any).providers = [mockProvider];
      (emailService as any).primaryProvider = mockProvider;

      const message = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
      };

      // Act
      const result = await emailService.sendEmail(message);

      // Assert
      expect(result.success).toBe(true);
      expect(result.provider).toBe('test-provider');
      expect(mockProvider.send).toHaveBeenCalledWith(message);
    });

    it('should fallback to secondary provider on primary failure', async () => {
      // Arrange
      const primaryProvider = {
        name: 'primary',
        send: jest.fn().mockResolvedValue({
          success: false,
          error: 'Primary failed',
          provider: 'primary',
          deliveryTime: 100,
        }),
        healthCheck: jest.fn().mockResolvedValue(false),
      };

      const secondaryProvider = {
        name: 'secondary',
        send: jest.fn().mockResolvedValue({
          success: true,
          messageId: 'secondary-id',
          provider: 'secondary',
          deliveryTime: 150,
        }),
        healthCheck: jest.fn().mockResolvedValue(true),
      };

      // Mock the providers array
      (emailService as any).providers = [primaryProvider, secondaryProvider];
      (emailService as any).primaryProvider = primaryProvider;

      const message = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
      };

      // Act
      const result = await emailService.sendEmail(message);

      // Assert
      expect(result.success).toBe(true);
      expect(result.provider).toBe('secondary');
      expect(primaryProvider.send).toHaveBeenCalledWith(message);
      expect(secondaryProvider.send).toHaveBeenCalledWith(message);
    });

    it('should return failure when all providers fail', async () => {
      // Arrange
      const provider1 = {
        name: 'provider1',
        send: jest.fn().mockResolvedValue({
          success: false,
          error: 'Provider 1 failed',
          provider: 'provider1',
          deliveryTime: 100,
        }),
        healthCheck: jest.fn().mockResolvedValue(false),
      };

      const provider2 = {
        name: 'provider2',
        send: jest.fn().mockResolvedValue({
          success: false,
          error: 'Provider 2 failed',
          provider: 'provider2',
          deliveryTime: 150,
        }),
        healthCheck: jest.fn().mockResolvedValue(false),
      };

      // Mock the providers array
      (emailService as any).providers = [provider1, provider2];
      (emailService as any).primaryProvider = provider1;

      const message = {
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
      };

      // Act
      const result = await emailService.sendEmail(message);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Provider 2 failed');
      expect(provider1.send).toHaveBeenCalledWith(message);
      expect(provider2.send).toHaveBeenCalledWith(message);
    });

    it('should perform health check on all providers', async () => {
      // Arrange
      const provider1 = {
        name: 'provider1',
        send: jest.fn(),
        healthCheck: jest.fn().mockResolvedValue(true),
      };

      const provider2 = {
        name: 'provider2',
        send: jest.fn(),
        healthCheck: jest.fn().mockResolvedValue(false),
      };

      // Mock the providers array
      (emailService as any).providers = [provider1, provider2];

      // Act
      const result = await emailService.healthCheck();

      // Assert
      expect(result).toEqual({
        provider1: true,
        provider2: false,
      });
      expect(provider1.healthCheck).toHaveBeenCalled();
      expect(provider2.healthCheck).toHaveBeenCalled();
    });

    it('should return list of provider names', () => {
      // Arrange
      const provider1 = { name: 'provider1', send: jest.fn(), healthCheck: jest.fn() };
      const provider2 = { name: 'provider2', send: jest.fn(), healthCheck: jest.fn() };

      // Mock the providers array
      (emailService as any).providers = [provider1, provider2];

      // Act
      const result = emailService.getProviders();

      // Assert
      expect(result).toEqual(['provider1', 'provider2']);
    });

    it('should return primary provider name', () => {
      // Arrange
      const primaryProvider = { name: 'primary', send: jest.fn(), healthCheck: jest.fn() };

      // Mock the primary provider
      (emailService as any).primaryProvider = primaryProvider;

      // Act
      const result = emailService.getPrimaryProvider();

      // Assert
      expect(result).toBe('primary');
    });

    it('should return null when no primary provider', () => {
      // Arrange
      (emailService as any).primaryProvider = null;

      // Act
      const result = emailService.getPrimaryProvider();

      // Assert
      expect(result).toBeNull();
    });
  });
});
