/**
 * Unit Tests for WebSocket Service
 */

import { WebSocketService } from '../../services/websocket';
import { logger } from '../../utils/logger';
import { Server as SocketIOServer } from 'socket.io';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('socket.io');

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('WebSocketService', () => {
  let webSocketService: WebSocketService;
  let mockIO: jest.Mocked<SocketIOServer>;
  let mockSocket: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock socket
    mockSocket = {
      id: 'socket_123',
      handshake: { address: '127.0.0.1' },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      on: jest.fn(),
      disconnect: jest.fn(),
    };

    // Mock Socket.IO server
    mockIO = {
      on: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      close: jest.fn(),
    } as any;

    webSocketService = WebSocketService.getInstance();
  });

  afterEach(() => {
    WebSocketService.resetInstance();
  });

  describe('initialization', () => {
    it('should initialize with Socket.IO server', () => {
      // Act
      webSocketService.initialize(mockIO);

      // Assert
      expect(mockIO.on).toHaveBeenCalledWith('connection', expect.any(Function));
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket service initialized');
    });

    it('should handle connection events', () => {
      // Arrange
      let connectionHandler: Function;
      mockIO.on.mockImplementation((event, handler) => {
        if (event === 'connection') {
          connectionHandler = handler;
        }
      });

      // Act
      webSocketService.initialize(mockIO);
      connectionHandler(mockSocket);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'WebSocket client connected',
        expect.objectContaining({
          socketId: 'socket_123',
          clientIP: '127.0.0.1',
        })
      );
    });
  });

  describe('joinRoom', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should add socket to room', () => {
      // Arrange
      const socketId = 'socket_123';
      const roomName = 'conversation_456';

      // Act
      webSocketService.joinRoom(socketId, roomName);

      // Assert
      expect(mockSocket.join).toHaveBeenCalledWith(roomName);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Socket joined room',
        expect.objectContaining({
          socketId,
          room: roomName,
        })
      );
    });

    it('should handle non-existent socket gracefully', () => {
      // Arrange
      const socketId = 'non_existent';
      const roomName = 'conversation_456';

      // Act
      webSocketService.joinRoom(socketId, roomName);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Socket not found for room join',
        expect.objectContaining({
          socketId,
          room: roomName,
        })
      );
    });
  });

  describe('leaveRoom', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should remove socket from room', () => {
      // Arrange
      const socketId = 'socket_123';
      const roomName = 'conversation_456';

      // Act
      webSocketService.leaveRoom(socketId, roomName);

      // Assert
      expect(mockSocket.leave).toHaveBeenCalledWith(roomName);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Socket left room',
        expect.objectContaining({
          socketId,
          room: roomName,
        })
      );
    });
  });

  describe('emitToRoom', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should emit event to all sockets in room', () => {
      // Arrange
      const roomName = 'conversation_456';
      const event = 'message_received';
      const data = { messageId: 'msg_123', content: 'Hello' };

      // Act
      webSocketService.emitToRoom(roomName, event, data);

      // Assert
      expect(mockIO.to).toHaveBeenCalledWith(roomName);
      expect(mockIO.emit).toHaveBeenCalledWith(event, data);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Event emitted to room',
        expect.objectContaining({
          room: roomName,
          event,
        })
      );
    });
  });

  describe('emitToSocket', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should emit event to specific socket', () => {
      // Arrange
      const socketId = 'socket_123';
      const event = 'message_status';
      const data = { status: 'delivered' };

      // Act
      webSocketService.emitToSocket(socketId, event, data);

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith(event, data);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Event emitted to socket',
        expect.objectContaining({
          socketId,
          event,
        })
      );
    });

    it('should handle non-existent socket gracefully', () => {
      // Arrange
      const socketId = 'non_existent';
      const event = 'message_status';
      const data = { status: 'delivered' };

      // Act
      webSocketService.emitToSocket(socketId, event, data);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Socket not found for event emission',
        expect.objectContaining({
          socketId,
          event,
        })
      );
    });
  });

  describe('broadcastToOrganization', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should broadcast event to organization room', () => {
      // Arrange
      const organizationId = 'org_123';
      const event = 'organization_update';
      const data = { update: 'settings_changed' };

      // Act
      webSocketService.broadcastToOrganization(organizationId, event, data);

      // Assert
      expect(mockIO.to).toHaveBeenCalledWith(`org:${organizationId}`);
      expect(mockIO.emit).toHaveBeenCalledWith(event, data);
    });
  });

  describe('getConnectedSockets', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should return list of connected socket IDs', () => {
      // Act
      const sockets = webSocketService.getConnectedSockets();

      // Assert
      expect(Array.isArray(sockets)).toBe(true);
      expect(sockets).toContain('socket_123');
    });
  });

  describe('getSocketsByRoom', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should return sockets in specific room', () => {
      // Arrange
      const roomName = 'conversation_456';

      // Act
      const sockets = webSocketService.getSocketsByRoom(roomName);

      // Assert
      expect(Array.isArray(sockets)).toBe(true);
    });
  });

  describe('disconnectSocket', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should disconnect specific socket', () => {
      // Arrange
      const socketId = 'socket_123';

      // Act
      webSocketService.disconnectSocket(socketId);

      // Assert
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Socket disconnected',
        expect.objectContaining({
          socketId,
        })
      );
    });
  });

  describe('handleMessageEvents', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should handle message created event', () => {
      // Arrange
      const message = {
        id: 'msg_123',
        conversationId: 'conv_456',
        organizationId: 'org_123',
        content: 'Hello',
        sender: { type: 'customer' },
      };

      // Act
      webSocketService.handleMessageCreated(message);

      // Assert
      expect(mockIO.to).toHaveBeenCalledWith(`conversation:${message.conversationId}`);
      expect(mockIO.emit).toHaveBeenCalledWith('message:created', message);
    });

    it('should handle message updated event', () => {
      // Arrange
      const message = {
        id: 'msg_123',
        conversationId: 'conv_456',
        organizationId: 'org_123',
        status: 'delivered',
      };

      // Act
      webSocketService.handleMessageUpdated(message);

      // Assert
      expect(mockIO.to).toHaveBeenCalledWith(`conversation:${message.conversationId}`);
      expect(mockIO.emit).toHaveBeenCalledWith('message:updated', message);
    });

    it('should handle typing indicator', () => {
      // Arrange
      const typingData = {
        conversationId: 'conv_456',
        userId: 'user_123',
        isTyping: true,
      };

      // Act
      webSocketService.handleTypingIndicator(typingData);

      // Assert
      expect(mockIO.to).toHaveBeenCalledWith(`conversation:${typingData.conversationId}`);
      expect(mockIO.emit).toHaveBeenCalledWith('typing:indicator', typingData);
    });
  });

  describe('close', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should close WebSocket server', () => {
      // Act
      webSocketService.close();

      // Assert
      expect(mockIO.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket service closed');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      webSocketService.initialize(mockIO);
    });

    it('should handle socket errors gracefully', () => {
      // Arrange
      const error = new Error('Socket error');
      let errorHandler: Function;
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'error') {
          errorHandler = handler;
        }
      });

      // Simulate connection to set up error handler
      let connectionHandler: Function;
      mockIO.on.mockImplementation((event, handler) => {
        if (event === 'connection') {
          connectionHandler = handler;
        }
      });
      webSocketService.initialize(mockIO);
      connectionHandler(mockSocket);

      // Act
      errorHandler(error);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket error',
        expect.objectContaining({
          socketId: 'socket_123',
          error: 'Socket error',
        })
      );
    });
  });
});
