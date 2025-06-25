# 🤝 Contributing Guide

Welcome to the Universal AI Customer Service Platform! We're excited to have you contribute to this project.

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [Getting Started](#-getting-started)
- [Development Setup](#-development-setup)
- [Contributing Process](#-contributing-process)
- [Coding Standards](#-coding-standards)
- [Testing Guidelines](#-testing-guidelines)
- [Documentation](#-documentation)
- [Pull Request Process](#-pull-request-process)
- [Issue Reporting](#-issue-reporting)
- [Community](#-community)

## 📜 Code of Conduct

### Our Pledge
We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards
- **Be respectful**: Treat everyone with respect and kindness
- **Be inclusive**: Welcome newcomers and help them get started
- **Be collaborative**: Work together to solve problems
- **Be constructive**: Provide helpful feedback and suggestions
- **Be patient**: Remember that everyone is learning

### Enforcement
Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the project team at conduct@universalai-cs.com.

## 🚀 Getting Started

### Prerequisites
- Node.js 18.0+
- PostgreSQL 14+
- Redis 6+
- Docker 20.0+
- Git

### First Contribution
1. **Fork the repository**
2. **Clone your fork**
3. **Set up development environment**
4. **Make your changes**
5. **Submit a pull request**

## 💻 Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/universal-ai-customer-service.git
cd universal-ai-customer-service
```

### 2. Install Dependencies
```bash
# Install all workspace dependencies
npm install

# Or using yarn
yarn install
```

### 3. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### 4. Start Development Environment
```bash
# Start infrastructure services
docker-compose up -d postgres redis rabbitmq

# Run database migrations
npm run db:migrate

# Seed initial data
npm run db:seed

# Start all services
npm run dev
```

### 5. Verify Setup
```bash
# Run health checks
npm run health-check

# Run tests
npm test

# Check code style
npm run lint
```

## 🔄 Contributing Process

### 1. Choose an Issue
- Browse [open issues](https://github.com/your-org/universal-ai-customer-service/issues)
- Look for issues labeled `good first issue` for beginners
- Comment on the issue to let others know you're working on it

### 2. Create a Branch
```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### 3. Make Changes
- Write clean, well-documented code
- Follow our coding standards
- Add tests for new functionality
- Update documentation as needed

### 4. Test Your Changes
```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e

# Check code coverage
npm run test:coverage
```

### 5. Commit Your Changes
```bash
# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "feat: add user authentication middleware"
```

### 6. Push and Create Pull Request
```bash
# Push to your fork
git push origin feature/your-feature-name

# Create pull request on GitHub
```

## 📝 Coding Standards

### TypeScript Guidelines
- Use TypeScript for all new code
- Enable strict mode
- Provide proper type annotations
- Use interfaces for object shapes

```typescript
// Good
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

const createUser = (userData: Omit<User, 'id' | 'createdAt'>): User => {
  return {
    id: generateId(),
    createdAt: new Date(),
    ...userData,
  };
};

// Avoid
const createUser = (userData: any) => {
  // Implementation
};
```

### Code Style
- Use ESLint and Prettier for consistent formatting
- Follow functional programming principles when possible
- Use meaningful variable and function names
- Keep functions small and focused

```typescript
// Good
const calculateTotalPrice = (items: CartItem[]): number => {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
};

// Avoid
const calc = (items: any) => {
  let t = 0;
  for (let i = 0; i < items.length; i++) {
    t += items[i].price * items[i].quantity;
  }
  return t;
};
```

### File Organization
```
src/
├── controllers/     # API endpoint handlers
├── services/        # Business logic
├── models/          # Data models and types
├── middleware/      # Express middleware
├── routes/          # API route definitions
├── utils/           # Utility functions
├── types/           # TypeScript type definitions
└── __tests__/       # Test files
```

### Naming Conventions
- **Files**: kebab-case (`user-service.ts`)
- **Directories**: kebab-case (`user-management/`)
- **Variables/Functions**: camelCase (`getUserById`)
- **Classes**: PascalCase (`UserService`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Interfaces**: PascalCase with 'I' prefix (`IUserRepository`)

## 🧪 Testing Guidelines

### Test Structure
```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a user with valid data', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
      };

      // Act
      const user = await userService.createUser(userData);

      // Assert
      expect(user).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.id).toBeDefined();
    });

    it('should throw error with invalid email', async () => {
      // Arrange
      const userData = {
        email: 'invalid-email',
        name: 'Test User',
      };

      // Act & Assert
      await expect(userService.createUser(userData)).rejects.toThrow('Invalid email format');
    });
  });
});
```

### Testing Requirements
- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test service interactions
- **End-to-End Tests**: Test complete user workflows
- **Minimum Coverage**: 80% code coverage required

### Test Commands
```bash
# Run all tests
npm test

# Run specific test file
npm test -- user-service.test.ts

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📚 Documentation

### Code Documentation
- Use JSDoc comments for functions and classes
- Document complex algorithms and business logic
- Include examples for public APIs

```typescript
/**
 * Creates a new user account with the provided information.
 * 
 * @param userData - The user data for account creation
 * @param userData.email - User's email address (must be unique)
 * @param userData.name - User's full name
 * @param userData.password - User's password (will be hashed)
 * @returns Promise that resolves to the created user object
 * 
 * @throws {ValidationError} When email format is invalid
 * @throws {ConflictError} When email already exists
 * 
 * @example
 * ```typescript
 * const user = await createUser({
 *   email: 'john@example.com',
 *   name: 'John Doe',
 *   password: 'securePassword123'
 * });
 * ```
 */
export const createUser = async (userData: CreateUserRequest): Promise<User> => {
  // Implementation
};
```

### API Documentation
- Update OpenAPI/Swagger specs for API changes
- Include request/response examples
- Document error responses

### README Updates
- Update feature lists for new functionality
- Add setup instructions for new dependencies
- Include usage examples

## 🔍 Pull Request Process

### Before Submitting
- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] Documentation is updated
- [ ] No merge conflicts
- [ ] Commit messages are clear

### PR Template
```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass
```

### Review Process
1. **Automated Checks**: CI/CD pipeline runs tests and linting
2. **Code Review**: Team members review the code
3. **Approval**: At least one approval required
4. **Merge**: Maintainer merges the PR

## 🐛 Issue Reporting

### Bug Reports
Use the bug report template:

```markdown
**Bug Description**
Clear description of the bug.

**Steps to Reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment**
- OS: [e.g., macOS, Windows, Linux]
- Browser: [e.g., Chrome, Firefox]
- Version: [e.g., 1.0.0]
```

### Feature Requests
Use the feature request template:

```markdown
**Feature Description**
Clear description of the feature.

**Use Case**
Why is this feature needed?

**Proposed Solution**
How should this feature work?

**Alternatives**
Alternative solutions considered.
```

## 🏷️ Commit Message Guidelines

### Format
```
type(scope): description

[optional body]

[optional footer]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

### Examples
```bash
feat(auth): add JWT token refresh functionality

fix(api): resolve memory leak in message processing

docs(readme): update installation instructions

test(user): add unit tests for user validation
```

## 🌟 Recognition

### Contributors
We recognize contributors in several ways:
- **Contributors file**: Listed in CONTRIBUTORS.md
- **Release notes**: Mentioned in release announcements
- **Hall of fame**: Featured on our website
- **Swag**: Stickers and t-shirts for significant contributions

### Contribution Types
We value all types of contributions:
- Code contributions
- Documentation improvements
- Bug reports
- Feature suggestions
- Community support
- Testing and QA
- Design and UX

## 💬 Community

### Communication Channels
- **Discord**: [discord.gg/universalai-cs](https://discord.gg/universalai-cs)
- **GitHub Discussions**: For feature discussions
- **GitHub Issues**: For bug reports and feature requests
- **Email**: contribute@universalai-cs.com

### Getting Help
- Check existing documentation
- Search GitHub issues
- Ask in Discord #help channel
- Email the maintainers

### Mentorship
New contributors can request mentorship:
- Pair programming sessions
- Code review guidance
- Architecture discussions
- Career advice

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to the Universal AI Customer Service Platform! Your contributions help make customer service better for everyone. 🚀
